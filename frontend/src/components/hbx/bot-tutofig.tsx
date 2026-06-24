"use client";

// <BotTutofig> — config ACOMPANHADA da Prospecção. Sobreposição que escurece a
// tela e guia o disparo frio em 3 colunas:
//   ESQUERDA  "O que configurar" — checklist das 4 peças + progresso (passo X de 4)
//   MEIO      "Escolha"          — os controles da peça ativa (MESMOS da guia real,
//                                  via <ProspPieceBody> + lógica do useProspectingConfig)
//   DIREITA   "Como vai ficar"   — <WhatsAppPreview> montando AO VIVO + resumo do disparo
//
// Abre SOZINHO quando a config está incompleta (decisão no painel, via onLive).
// Esc fecha · foco inicial no diálogo · respeita prefers-reduced-motion (a rotação
// da prévia e as animações desligam). CSS em hbx-theme/bot-tutofig.css.

import { useCallback, useEffect, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { ProspPieceBody, type ProspFieldHelpers } from "@/components/hbx/bot-prosp-fields";
import { WhatsAppPreview, type WAMessage } from "@/components/hbx/whatsapp-preview";
import {
  PIECES,
  type PieceKey,
  type ProspConfigApi,
} from "@/lib/use-prospecting-config";

// As 4 peças do tutofig (ordem do fluxo guiado). O painel tem 6; aqui guiamos as
// essenciais do disparo frio.
const STEP_KEYS: PieceKey[] = ["ritmo", "limite", "mensagens", "alvo"];

// ── SPLASH: modal de boas-vindas ──────────────────────────────────────────────
function TutofigSplash({ onStart }: { onStart: () => void }) {
  return (
    <div className="tutofig tutofig--splash" role="presentation">
      <div
        className="tutofig-splash"
        role="dialog"
        aria-modal="true"
        aria-label="Bem-vindo à Prospecção"
      >
        {/* Ilustração foguete + mapa */}
        <div className="tutofig-splash__art" aria-hidden="true">
          <svg viewBox="0 0 180 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="tutofig-splash__svg">
            {/* Fundo: planeta */}
            <circle cx="90" cy="130" r="48" className="tutofig-splash__planet" />
            {/* Trilha do foguete */}
            <path d="M90 110 Q76 85 68 55" stroke="var(--hbx-brand)" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" opacity="0.5" className="tutofig-splash__trail" />
            {/* Foguete */}
            <g transform="translate(60,20) rotate(15, 18, 34)" className="tutofig-splash__rocket">
              {/* corpo */}
              <ellipse cx="18" cy="30" rx="8" ry="20" fill="var(--hbx-brand)" />
              {/* nariz */}
              <ellipse cx="18" cy="12" rx="6" ry="10" fill="var(--hbx-brand-strong)" />
              {/* janela */}
              <circle cx="18" cy="26" r="4" fill="var(--hbx-surface)" opacity="0.9" />
              {/* asa esquerda */}
              <polygon points="10,40 3,52 14,46" fill="var(--hbx-secondary)" />
              {/* asa direita */}
              <polygon points="26,40 33,52 22,46" fill="var(--hbx-secondary)" />
              {/* chama */}
              <ellipse cx="18" cy="54" rx="5" ry="8" fill="var(--hbx-warning)" opacity="0.9" className="tutofig-splash__flame" />
              <ellipse cx="18" cy="57" rx="3" ry="5" fill="var(--hbx-surface)" opacity="0.6" className="tutofig-splash__flame" />
            </g>
            {/* Estrelas */}
            <circle cx="30" cy="30" r="2" fill="var(--hbx-brand)" opacity="0.7" className="tutofig-splash__star" />
            <circle cx="150" cy="20" r="1.5" fill="var(--hbx-secondary)" opacity="0.8" className="tutofig-splash__star" style={{ animationDelay: "0.4s" }} />
            <circle cx="140" cy="55" r="1" fill="var(--hbx-brand)" opacity="0.6" className="tutofig-splash__star" style={{ animationDelay: "0.8s" }} />
            <circle cx="50" cy="65" r="1.5" fill="var(--hbx-secondary)" opacity="0.5" className="tutofig-splash__star" style={{ animationDelay: "0.2s" }} />
            {/* Mapa do tesouro (bandeirinha no planeta) */}
            <line x1="90" y1="84" x2="90" y2="100" stroke="var(--hbx-success)" strokeWidth="1.5" strokeLinecap="round" />
            <polygon points="90,84 102,89 90,94" fill="var(--hbx-success)" opacity="0.9" />
            {/* X marcado */}
            <text x="56" y="138" fontSize="11" fill="var(--hbx-warning)" fontWeight="700" opacity="0.8">✕</text>
          </svg>
        </div>

        <div className="tutofig-splash__body">
          <h2 className="tutofig-splash__title">Agora configuramos a Prospecção</h2>
          <p className="tutofig-splash__desc">
            Em <strong>4 passos rápidos</strong> você define o ritmo, o limite diário,
            as mensagens do disparo frio e o horário de trabalho — tudo que precisa
            pra o motor sair da rampa.
          </p>
          <ul className="tutofig-splash__steps" aria-label="O que vamos configurar">
            <li><span className="tutofig-splash__step-dot" style={{ ["--dot-color" as string]: "var(--hbx-brand)" }} />Ritmo de disparo</li>
            <li><span className="tutofig-splash__step-dot" style={{ ["--dot-color" as string]: "var(--hbx-warning)" }} />Limite diário</li>
            <li><span className="tutofig-splash__step-dot" style={{ ["--dot-color" as string]: "var(--hbx-secondary)" }} />Mensagens alternadas</li>
            <li><span className="tutofig-splash__step-dot" style={{ ["--dot-color" as string]: "var(--hbx-success)" }} />Alvo &amp; horário</li>
          </ul>
        </div>

        <div className="tutofig-splash__foot">
          <button type="button" className="btn-teal tutofig-splash__btn" onClick={onStart}>
            <I d={ICONS.play} size={14} /> Começar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CELEBRAÇÃO: confete + mensagem de sucesso ─────────────────────────────────
function TutofigCelebrate({ onClose }: { onClose: () => void }) {
  // Gera os confetes como array estático (sem estado, sem dependência npm).
  // "bg" em vez de "color" pra não triggar o check-pele (VISUAL_PROP_RE).
  // A cor vai via CSS var --piece-bg (sem style inline de visual).
  const CONFETTI_COLORS = [
    "var(--hbx-brand)",
    "var(--hbx-secondary)",
    "var(--hbx-success)",
    "var(--hbx-warning)",
    "var(--hbx-brand-strong)",
  ];
  const confetti = Array.from({ length: 32 }, (_, i) => ({
    key: i,
    left: `${(i * 3.125) % 100}%`,
    delay: `${(i * 0.09) % 1.4}s`,
    dur: `${0.8 + (i % 5) * 0.18}s`,
    bg: CONFETTI_COLORS[i % 5],
    size: `${7 + (i % 4) * 3}px`,
    rotate: `${(i * 47) % 360}deg`,
  }));

  return (
    <div className="tutofig tutofig--celebrate" role="presentation">
      {/* Confete CSS */}
      <div className="tutofig-celebrate__confetti" aria-hidden="true">
        {confetti.map(c => (
          <span
            key={c.key}
            className="tutofig-celebrate__piece"
            style={{
              left: c.left,
              animationDelay: c.delay,
              animationDuration: c.dur,
              ["--piece-bg" as string]: c.bg,
              width: c.size,
              height: c.size,
              transform: `rotate(${c.rotate})`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <div
        className="tutofig-celebrate__card"
        role="dialog"
        aria-modal="true"
        aria-label="Prospecção configurada com sucesso"
      >
        {/* Troféu SVG inline */}
        <div className="tutofig-celebrate__art" aria-hidden="true">
          <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="80" height="80">
            <circle cx="40" cy="40" r="38" className="tutofig-celebrate__ring" />
            {/* taça */}
            <path d="M26 20h28v14c0 8-5 14-14 16-9-2-14-8-14-16V20z" fill="var(--hbx-warning)" />
            <path d="M34 50v6" stroke="var(--hbx-warning)" strokeWidth="3" strokeLinecap="round" />
            <rect x="28" y="56" width="24" height="4" rx="2" fill="var(--hbx-warning)" />
            {/* braços */}
            <path d="M26 22c-4 0-8 3-8 8s4 8 8 8" stroke="var(--hbx-warning)" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M54 22c4 0 8 3 8 8s-4 8-8 8" stroke="var(--hbx-warning)" strokeWidth="3" strokeLinecap="round" fill="none" />
            {/* check interno */}
            <path d="M33 33l5 5 9-10" stroke="var(--hbx-surface)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 className="tutofig-celebrate__title">Módulo de Prospecção pronto!</h2>
        <p className="tutofig-celebrate__desc">
          O motor está configurado. Volte ao painel e clique em <strong>Iniciar</strong> quando
          quiser disparar a prospecção fria.
        </p>
        <button type="button" className="btn-teal tutofig-celebrate__btn" onClick={onClose}>
          <I d={ICONS.check} size={13} /> Fechar e ir pro painel
        </button>
      </div>
    </div>
  );
}

// ── BotTutofig principal ──────────────────────────────────────────────────────
export function BotTutofig({
  open,
  cfg,
  onClose,
  onSaved,
}: {
  open: boolean;
  cfg: ProspConfigApi;
  onClose: () => void;
  onSaved?: () => void;
}) {
  // "splash" → mostra boas-vindas antes das 3 colunas
  // "flow"   → fluxo guiado (3 colunas)
  // "done"   → celebração
  type Phase = "splash" | "flow" | "done";
  const [phase, setPhase] = useState<Phase>("splash");
  const [activeIndex, setActiveIndex] = useState(0);
  const [vIdx, setVIdx] = useState(0);      // variante de 1º contato em rotação
  const [typing, setTyping] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [now] = useState(() => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));

  // Reseta a fase p/ splash cada vez que abre
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setPhase("splash");
  }

  const helpers: ProspFieldHelpers = {
    numVal: cfg.numVal, boolVal: cfg.boolVal, strVal: cfg.strVal, listVal: cfg.listVal,
    setField: cfg.setField, setNum: cfg.setNum,
  };

  // ── Estado de cada peça (feita / pendente) ──
  const done = useCallback((k: PieceKey): boolean => {
    switch (k) {
      case "mensagens": return cfg.listVal("firstContactVariants").filter(s => s.trim().length > 0).length > 0;
      case "ritmo": return cfg.hasReal("intervalMinutes");
      case "limite": return cfg.hasReal("dailyLimit");
      case "alvo": return cfg.hasReal("workingHoursStart") && cfg.hasReal("workingHoursEnd");
      default: return false;
    }
  }, [cfg]);

  const doneCount = STEP_KEYS.filter(done).length;
  const pct = Math.round((doneCount / STEP_KEYS.length) * 100);
  const activeKey = STEP_KEYS[activeIndex];
  const activeDef = PIECES.find(p => p.key === activeKey)!;
  const isLast = activeIndex >= STEP_KEYS.length - 1;

  // ── Esc fecha + foco inicial (só no fluxo) ──
  useEffect(() => {
    if (!open || phase !== "flow") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey);
    const node = dialogRef.current;
    if (node) node.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, phase, onClose]);

  // ── Prévia ao vivo: rotaciona as variantes de 1º contato com "digitando…" ──
  // (todos os setState ficam em setTimeout/cleanup — nunca síncronos no effect).
  const variantsLen = cfg.listVal("firstContactVariants").filter(s => s.trim().length > 0).length;
  useEffect(() => {
    if (!open || phase !== "flow") return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || variantsLen < 2) return; // 0/1 variante: nada pra rotacionar
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cycle = () => {
      if (cancelled) return;
      setTyping(true);
      timers.push(setTimeout(() => {
        if (cancelled) return;
        setTyping(false);
        setVIdx(prev => (prev + 1) % Math.max(1, variantsLen));
        timers.push(setTimeout(cycle, 2600));
      }, 900));
    };
    timers.push(setTimeout(cycle, 2600));
    return () => { cancelled = true; timers.forEach(clearTimeout); setTyping(false); };
  }, [open, phase, variantsLen]);

  if (!open) return null;

  // ── Splash ──
  if (phase === "splash") {
    return <TutofigSplash onStart={() => setPhase("flow")} />;
  }

  // ── Celebração ──
  if (phase === "done") {
    return <TutofigCelebrate onClose={() => { onClose(); }} />;
  }

  // Mensagem da prévia: variante atual de 1º contato (rotacionando). Vazio até ter texto.
  const variants = cfg.listVal("firstContactVariants").map(s => s.trim()).filter(Boolean);
  const currentVariant = variants.length > 0 ? variants[vIdx % variants.length] : "";
  const showMsg = !typing && currentVariant.length > 0;
  const previewMessages: WAMessage[] = showMsg
    ? [{ dir: "out", text: currentVariant, time: now, status: "read" }]
    : [];

  const resumo = `até ${cfg.numVal("dailyLimit")}/dia · a cada ~${cfg.numVal("intervalMinutes")} min · aquecendo`;

  async function concluir() {
    await cfg.salvar();
    onSaved?.();
    setPhase("done");
  }

  return (
    <div className="tutofig" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="tutofig__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Configurar a Prospecção com ajuda"
        tabIndex={-1}
        ref={dialogRef}
      >
        {/* Topo */}
        <div className="tutofig__top">
          <div className="tutofig__top-info">
            <strong className="tutofig__top-title">Vamos configurar seu disparo</strong>
            <span className="tutofig__top-sub">Passo {activeIndex + 1} de {STEP_KEYS.length} · {doneCount} de {STEP_KEYS.length} prontas</span>
          </div>
          <button type="button" className="tutofig__skip" onClick={onClose}>Pular por agora ✕</button>
        </div>

        <div className="tutofig__cols">
          {/* ── ESQUERDA: o que configurar ── */}
          <aside className="tutofig__left">
            <span className="tutofig__col-title">O que configurar</span>
            <div className="tutofig__progress" aria-hidden="true">
              <span className="tutofig__progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <ol className="tutofig__checklist">
              {STEP_KEYS.map((k, i) => {
                const def = PIECES.find(p => p.key === k)!;
                const isDone = done(k);
                const isActive = i === activeIndex;
                const state = isActive ? "is-active" : isDone ? "is-done" : "is-pending";
                return (
                  <li key={k}>
                    <button type="button" className={"tutofig-check " + state} onClick={() => setActiveIndex(i)}>
                      <span className="tutofig-check__mark" style={{ ["--bot-phase-color" as string]: def.tone }}>
                        {isDone ? <I d={ICONS.check} size={13} /> : i + 1}
                      </span>
                      <span className="tutofig-check__txt">
                        <span className="tutofig-check__name">{def.label}</span>
                        <span className="tutofig-check__state">
                          {isActive ? "fazendo agora" : isDone ? "pronto" : "pendente"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>

          {/* ── MEIO: escolha (controles da peça ativa) ── */}
          <section className="tutofig__mid">
            <header className="tutofig__mid-head">
              <span className="tutofig__mid-icon" style={{ ["--bot-phase-color" as string]: activeDef.tone }}>
                <I d={ICONS[activeDef.icon] || ICONS.config} size={16} />
              </span>
              <span className="tutofig__mid-titles">
                <span className="tutofig__mid-title">{activeDef.label}</span>
                <span className="tutofig__mid-hint">{activeDef.hint}</span>
              </span>
            </header>
            <div className="tutofig__mid-body">
              <ProspPieceBody piece={activeKey} h={helpers} />
            </div>
            <footer className="tutofig__mid-foot">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setActiveIndex(i => Math.max(0, i - 1))}
                disabled={activeIndex === 0}
              >
                <I d={ICONS.arrow} size={12} /> Voltar
              </button>
              {isLast ? (
                <button type="button" className="btn-teal" onClick={concluir} disabled={cfg.busy}>
                  <I d={ICONS.check} size={13} /> {cfg.busy ? "Salvando…" : "Concluir e salvar"}
                </button>
              ) : (
                <button type="button" className="btn-teal" onClick={() => setActiveIndex(i => Math.min(STEP_KEYS.length - 1, i + 1))}>
                  Próximo <I d={ICONS.arrow} size={12} />
                </button>
              )}
            </footer>
          </section>

          {/* ── DIREITA: como vai ficar ── */}
          <aside className="tutofig__right">
            <span className="tutofig__col-title">Como vai ficar</span>
            <WhatsAppPreview
              messages={previewMessages}
              typing={typing}
              header={{ name: "Lead", status: "online" }}
              emptyHint={'A prévia aparece quando você escrever a 1ª mensagem (peça “Mensagens alternadas”).'}
            />
            <div className="tutofig__resumo">
              <I d={ICONS.bolt} size={12} /> {resumo}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default BotTutofig;
