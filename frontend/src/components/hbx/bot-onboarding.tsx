"use client";

// <BotOnboarding> — onboarding GAMIFICADO dos bots de Menu (Atendimento e Recovery).
// Espelha o padrão do <BotTutofig> da Prospecção: véu escuro + 3 colunas:
//   ESQUERDA  "Configurar"  — checklist clicável dos campos + barra de progresso
//   MEIO      "Editar"      — textarea do campo ativo (fade/slide ao trocar)
//   DIREITA   "Prévia"      — <WhatsAppPreview> ao vivo com a mensagem digitada
//
// Passo 0 = Splash animado de boas-vindas.
// Passo 1 = Status da conexão WhatsApp (read-only, nunca dispara chip).
// Passos 2…N = um por campo em `fields`.
// Final = celebração CSS + "Ativar bot" / "Concluir".
// Esc fecha · botão "Pular por agora ✕" · foco inicial no diálogo.
// prefers-reduced-motion desliga confete/rotação.
// CSS em hbx-theme/bot-onboarding.css (importar no globals.css).

import { useCallback, useEffect, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { WhatsAppPreview, type WAMessage } from "@/components/hbx/whatsapp-preview";

// ─────────────────────────────────────────────────────────────────────────────
// Contrato público
// ─────────────────────────────────────────────────────────────────────────────

export type BotOnboardingField = {
  key: string;
  label: string;
  hint: string;
  icon: string;
  tone: string;
  buttonsKey?: "welcomeButtons" | "mainMenuButtons";
};

export function BotOnboarding(props: {
  open: boolean;
  botType: "atendimento" | "recovery";
  fields: BotOnboardingField[];
  value: (key: string) => string;
  onChange: (key: string, next: string) => void;
  onSave: () => Promise<void> | void;
  saving?: boolean;
  connectionReady?: boolean;
  connectionHint?: string;
  onClose: () => void;
  onRequestActivate?: () => void;
}): React.JSX.Element | null {
  const {
    open, botType, fields, value, onChange, onSave,
    saving = false, connectionReady, connectionHint,
    onClose, onRequestActivate,
  } = props;

  // ── Fases internas ──
  // splash=0, conexão=1, campos=2…(N+1), celebração=N+2
  const PHASE_SPLASH = 0;
  const PHASE_CONN   = 1;
  const PHASE_FIELDS_START = 2;
  const PHASE_DONE   = PHASE_FIELDS_START + fields.length;

  const [phase, setPhase] = useState(PHASE_SPLASH);
  const [activeFieldIdx, setActiveFieldIdx] = useState(0);
  const [animating, setAnimating] = useState(false);   // fade do textarea
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const prevOpenRef = useRef(false);

  // Horário do balão da prévia — mesmo cuidado de hydration do bot-tutofig:
  // inicia vazio (bate com o SSR) e preenche no mount, com fuso de Brasília.
  const [now, setNow] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- relógio lido 1x no mount; SSR e 1º render batem em "".
    setNow(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }));
  }, []);

  // ── Esc fecha + foco ──
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    document.addEventListener("keydown", onKey);
    const node = dialogRef.current;
    if (node) node.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ── Reset quando reabre (rising edge via ref — nunca setState síncrono no body) ──
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open || wasOpen) return;
    const t = setTimeout(() => {
      setPhase(PHASE_SPLASH);
      setActiveFieldIdx(0);
      setAnimating(false);
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  // ── Derivações ──
  const isDone = useCallback(
    (idx: number) => (value(fields[idx]?.key ?? "") ?? "").trim().length > 0,
    [fields, value]
  );
  const doneCount = fields.filter((_, i) => isDone(i)).length;
  const pct = fields.length > 0 ? Math.round((doneCount / fields.length) * 100) : 0;
  const inFields = phase >= PHASE_FIELDS_START && phase < PHASE_DONE;
  const currentField = inFields ? fields[activeFieldIdx] : null;

  // ── Navegar com transição suave ──
  const goTo = useCallback((newPhase: number, fieldIdx?: number) => {
    setAnimating(true);
    const timer = setTimeout(() => {
      setPhase(newPhase);
      if (fieldIdx !== undefined) setActiveFieldIdx(fieldIdx);
      setAnimating(false);
    }, 160);
    return () => clearTimeout(timer);
  }, []);

  function handleNext() {
    if (phase === PHASE_SPLASH) { goTo(PHASE_CONN); return; }
    if (phase === PHASE_CONN) { goTo(PHASE_FIELDS_START, 0); return; }
    if (inFields) {
      const nextIdx = activeFieldIdx + 1;
      if (nextIdx < fields.length) {
        goTo(phase + 1, nextIdx);
      } else {
        // salvar e ir pra celebração
        const doSave = async () => {
          await onSave();
          goTo(PHASE_DONE);
        };
        doSave();
      }
      return;
    }
  }

  function handleBack() {
    if (phase === PHASE_CONN) { goTo(PHASE_SPLASH); return; }
    if (inFields) {
      if (activeFieldIdx === 0) {
        goTo(PHASE_CONN);
      } else {
        goTo(phase - 1, activeFieldIdx - 1);
      }
      return;
    }
  }

  function handleChecklist(idx: number) {
    goTo(PHASE_FIELDS_START + idx, idx);
  }

  // ── Prévia ao vivo ──
  const headerName = botType === "atendimento" ? "Cliente" : "Lead";
  const liveText = currentField ? (value(currentField.key) ?? "").trim() : "";
  const previewMessages: WAMessage[] = liveText
    ? [{ dir: "out", text: liveText, time: now, status: "read" }]
    : [];

  const typeLabel = botType === "atendimento" ? "Atendimento" : "Recuperação de clientes";

  if (!open) return null;

  // ────────────────────────────────────────────────────────────────────────────
  // SPLASH (passo 0)
  // ────────────────────────────────────────────────────────────────────────────
  if (phase === PHASE_SPLASH) {
    return (
      <div
        className="bot-onb-veil"
        role="presentation"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="bot-onb-splash"
          role="dialog"
          aria-modal="true"
          aria-label={`Onboarding bot de ${typeLabel}`}
          tabIndex={-1}
          ref={dialogRef}
        >
          <button type="button" className="bot-onb-splash__skip" onClick={onClose}>
            Pular por agora ✕
          </button>

          <div className="bot-onb-splash__icon" aria-hidden="true">
            <I d={ICONS.bot} size={40} />
          </div>

          <h2 className="bot-onb-splash__title">
            {botType === "atendimento"
              ? "Vamos criar seu bot de Atendimento!"
              : "Vamos criar seu bot de Recuperação de clientes!"}
          </h2>
          <p className="bot-onb-splash__sub">
            {fields.length} {fields.length === 1 ? "mensagem" : "mensagens"} pra configurar
            · prévia ao vivo enquanto você escreve · pronto em minutos
          </p>

          <button type="button" className="btn-teal bot-onb-splash__cta" onClick={handleNext}>
            Começar <I d={ICONS.arrow} size={14} />
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CELEBRAÇÃO (passo final)
  // ────────────────────────────────────────────────────────────────────────────
  if (phase === PHASE_DONE) {
    return (
      <div
        className="bot-onb-veil"
        role="presentation"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="bot-onb-celebrate"
          role="dialog"
          aria-modal="true"
          aria-label="Bot configurado com sucesso"
          tabIndex={-1}
          ref={dialogRef}
        >
          {/* Confete CSS puro */}
          <ConfettiSVG />

          <div className="bot-onb-celebrate__icon" aria-hidden="true">
            <I d={ICONS.check} size={36} />
          </div>

          <h2 className="bot-onb-celebrate__title">Parabéns!</h2>
          <p className="bot-onb-celebrate__sub">
            Bot de <strong>{typeLabel}</strong> configurado com sucesso
          </p>

          <div className="bot-onb-celebrate__actions">
            {onRequestActivate && (
              <button
                type="button"
                className="btn-teal"
                onClick={() => { onRequestActivate(); onClose(); }}
              >
                <I d={ICONS.bolt} size={14} /> Ativar bot
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={onClose}>
              Concluir
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PAINEL PRINCIPAL — conexão + campos (fases 1…N+1)
  // ────────────────────────────────────────────────────────────────────────────
  const stepNum = phase === PHASE_CONN ? 1 : (phase - PHASE_FIELDS_START + 2);
  const totalSteps = 1 + fields.length; // conexão + campos

  return (
    <div
      className="bot-onb-veil"
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bot-onb-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Configurar bot de ${typeLabel}`}
        tabIndex={-1}
        ref={dialogRef}
      >
        {/* ── Topo ── */}
        <div className="bot-onb-top">
          <div className="bot-onb-top__info">
            <strong className="bot-onb-top__title">
              {botType === "atendimento" ? "Bot de Atendimento" : "Bot de Recuperação"}
            </strong>
            <span className="bot-onb-top__sub">
              Passo {stepNum} de {totalSteps} · {doneCount} de {fields.length}{" "}
              {fields.length === 1 ? "pronta" : "prontas"}
            </span>
          </div>
          <button type="button" className="bot-onb-skip" onClick={onClose}>
            Pular por agora ✕
          </button>
        </div>

        <div className="bot-onb-cols">
          {/* ── ESQUERDA ── */}
          <aside className="bot-onb-left">
            <span className="bot-onb-col-title">O que configurar</span>
            <div className="bot-onb-progress" aria-hidden="true">
              <span className="bot-onb-progress__fill" style={{ width: `${pct}%` }} />
            </div>
            <ol className="bot-onb-checklist">
              {fields.map((f, i) => {
                const done = isDone(i);
                const active = inFields && i === activeFieldIdx;
                const state = active ? "is-active" : done ? "is-done" : "is-pending";
                return (
                  <li key={f.key}>
                    <button
                      type="button"
                      className={"bot-onb-check " + state}
                      onClick={() => handleChecklist(i)}
                    >
                      <span
                        className="bot-onb-check__mark"
                        style={{ ["--bot-phase-color" as string]: f.tone }}
                      >
                        {done ? <I d={ICONS.check} size={12} /> : i + 1}
                      </span>
                      <span className="bot-onb-check__txt">
                        <span className="bot-onb-check__name">{f.label}</span>
                        <span className="bot-onb-check__state">
                          {active ? "editando agora" : done ? "pronto" : "pendente"}
                        </span>
                      </span>
                      {done && !active && (
                        <span className="bot-onb-check__star" aria-hidden="true">★</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>

          {/* ── MEIO ── */}
          <section className="bot-onb-mid">
            {phase === PHASE_CONN ? (
              /* Passo de conexão */
              <div className={"bot-onb-mid__body bot-onb-fade" + (animating ? " is-out" : " is-in")}>
                <div className="bot-onb-conn">
                  <div
                    className={
                      "bot-onb-conn__status " +
                      (connectionReady ? "is-ready" : "is-pending")
                    }
                  >
                    <span className="bot-onb-conn__dot" aria-hidden="true" />
                    {connectionReady
                      ? "✓ WhatsApp conectado"
                      : connectionHint ?? "WhatsApp não conectado — conecte pelo painel antes de ativar"}
                  </div>
                  <p className="bot-onb-conn__note">
                    {connectionReady
                      ? "Sua conta está pronta. Continue para configurar as mensagens do bot."
                      : "Você ainda pode configurar as mensagens agora e ativar o bot depois, quando conectar."}
                  </p>
                </div>
              </div>
            ) : currentField ? (
              /* Passo de campo */
              <>
                <header className="bot-onb-mid__head">
                  <span
                    className="bot-onb-mid__icon"
                    style={{ ["--bot-phase-color" as string]: currentField.tone }}
                  >
                    <I d={ICONS[currentField.icon] || ICONS.msg} size={16} />
                  </span>
                  <span className="bot-onb-mid__titles">
                    <span className="bot-onb-mid__title">{currentField.label}</span>
                    <span className="bot-onb-mid__hint">{currentField.hint}</span>
                  </span>
                </header>
                <div
                  className={
                    "bot-onb-mid__body bot-onb-fade" +
                    (animating ? " is-out" : " is-in")
                  }
                >
                  <textarea
                    className="bot-onb-textarea"
                    placeholder={`Escreva aqui a mensagem de ${currentField.label.toLowerCase()}…`}
                    value={value(currentField.key) ?? ""}
                    onChange={e => onChange(currentField.key, e.target.value)}
                    rows={6}
                    autoFocus
                  />
                  {isDone(activeFieldIdx) && (
                    <div className="bot-onb-ready-badge" aria-live="polite">
                      <I d={ICONS.check} size={12} /> Pronto
                    </div>
                  )}
                </div>
              </>
            ) : null}

            {/* Rodapé de navegação */}
            <footer className="bot-onb-mid__foot">
              <button
                type="button"
                className="btn-ghost"
                onClick={handleBack}
                disabled={phase === PHASE_SPLASH}
              >
                <span className="bot-onb-back-ico" aria-hidden="true"><I d={ICONS.arrow} size={12} /></span> Voltar
              </button>

              {inFields && activeFieldIdx === fields.length - 1 ? (
                <button
                  type="button"
                  className="btn-teal"
                  onClick={handleNext}
                  disabled={saving}
                >
                  <I d={ICONS.check} size={13} />
                  {saving ? "Salvando…" : "Concluir"}
                </button>
              ) : (
                <button type="button" className="btn-teal" onClick={handleNext}>
                  Próximo <I d={ICONS.arrow} size={12} />
                </button>
              )}
            </footer>
          </section>

          {/* ── DIREITA ── */}
          <aside className="bot-onb-right">
            <span className="bot-onb-col-title">Como vai ficar</span>
            <WhatsAppPreview
              messages={previewMessages}
              header={{ name: headerName, status: "online" }}
              emptyHint="A prévia aparece quando você escrever a mensagem ao lado."
            />
            {inFields && (
              <div className="bot-onb-preview-hint">
                <I d={ICONS.bolt} size={12} />
                {doneCount}/{fields.length} mensagens configuradas
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Confete SVG puro (sem dependência npm)
// Desliga com prefers-reduced-motion via CSS.
// ─────────────────────────────────────────────────────────────────────────────
function ConfettiSVG() {
  return (
    <svg
      className="bot-onb-confetti"
      viewBox="0 0 400 200"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Retângulos coloridos via tokens (currentColor em cada grupo colorido) */}
      <g className="bot-onb-confetti__a">
        <rect x="20"  y="40"  width="8"  height="14" rx="2" className="bot-onb-conf--1" />
        <rect x="60"  y="10"  width="6"  height="10" rx="2" className="bot-onb-conf--2" />
        <rect x="100" y="30"  width="9"  height="15" rx="2" className="bot-onb-conf--3" />
        <rect x="145" y="5"   width="7"  height="12" rx="2" className="bot-onb-conf--4" />
        <rect x="200" y="20"  width="8"  height="13" rx="2" className="bot-onb-conf--1" />
        <rect x="250" y="8"   width="6"  height="11" rx="2" className="bot-onb-conf--2" />
        <rect x="300" y="35"  width="9"  height="14" rx="2" className="bot-onb-conf--3" />
        <rect x="360" y="15"  width="7"  height="12" rx="2" className="bot-onb-conf--4" />
      </g>
      <g className="bot-onb-confetti__b">
        <circle cx="40"  cy="80"  r="5" className="bot-onb-conf--2" />
        <circle cx="90"  cy="60"  r="4" className="bot-onb-conf--3" />
        <circle cx="150" cy="90"  r="6" className="bot-onb-conf--1" />
        <circle cx="220" cy="70"  r="4" className="bot-onb-conf--4" />
        <circle cx="280" cy="55"  r="5" className="bot-onb-conf--2" />
        <circle cx="340" cy="85"  r="4" className="bot-onb-conf--1" />
        <circle cx="380" cy="65"  r="5" className="bot-onb-conf--3" />
      </g>
      {/* Losangos */}
      <g className="bot-onb-confetti__c">
        <polygon points="70,130  76,120  82,130  76,140"  className="bot-onb-conf--4" />
        <polygon points="180,110 186,100 192,110 186,120" className="bot-onb-conf--1" />
        <polygon points="310,120 316,110 322,120 316,130" className="bot-onb-conf--3" />
      </g>
    </svg>
  );
}

export default BotOnboarding;
