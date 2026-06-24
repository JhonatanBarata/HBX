"use client";

// BotPhaseEditor — editor DESLIZANTE compartilhado pelos 3 modos de montagem
// (Tabuleiro / Trilha / Bandeja) do Construtor de Bot. Desliza da DIREITA e
// edita UMA peça (fase do bot) por vez: título + textarea da mensagem + botão
// "Variáveis" + <BotButtonsEditor> (quando a peça emite botões). Para a peça
// "Ajustes" mostra os toggles de regras (BOT_RULES).
//
// Casca/animação vêm das classes CENTRAIS do kit (.hbx-veil.to-right + .hbx-drawer);
// o visual do conteúdo mora em hbx-theme/bot-builder.css (zero hex/inline color).
//
// CRÍTICO — fechar SEM travar o véu: espelha EXATAMENTE o padrão já corrigido em
// bot-variables-drawer.tsx (estado `closing` + finishClose() que ZERA `closing`
// ANTES de onClose, onAnimationEnd + timeout de fallback, e
// `if (!open && !closing) return null` pra DESMONTAR ao fechar).

import { useCallback, useEffect, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { BotButtonsEditor, type BotButton, type BotAction } from "@/components/hbx/bot-buttons-editor";

// Espelha o tipo de regra da página (chave + label + hint).
export type PhaseRuleDef = {
  key: string;
  label: string;
  hint: string;
};

export type BotPhaseEditorProps = {
  open: boolean;
  // Identidade visual da peça
  title: string;
  hint: string;
  icon: string; // chave em ICONS
  tone: string; // token central (var(--hbx-*)) — vira --bot-phase-color no CSS
  // Peça "Ajustes" (regras) vs. peça de mensagem
  isSettings: boolean;
  // ── Peça de mensagem ──
  value: string;
  onChange: (next: string) => void;
  onFocusField: (el: HTMLTextAreaElement | null) => void;
  onOpenVariables: (el: HTMLTextAreaElement | null) => void;
  // botões (opcional — só quando a peça os emite)
  showButtons: boolean;
  buttons: BotButton[];
  actionCatalog: BotAction[];
  canUseOfficialButtons: boolean;
  buttonsLabel?: string;
  buttonsHint?: string;
  onButtonsChange: (next: BotButton[]) => void;
  // ── Peça "Ajustes" ──
  rules: PhaseRuleDef[];
  ruleValue: (key: string) => boolean;
  onToggleRule: (key: string) => void;
  // Fechamento
  onClose: () => void;
};

export function BotPhaseEditor(props: BotPhaseEditorProps): React.JSX.Element | null {
  const {
    open,
    title,
    hint,
    icon,
    tone,
    isSettings,
    value,
    onChange,
    onFocusField,
    onOpenVariables,
    showButtons,
    buttons,
    actionCatalog,
    canUseOfficialButtons,
    buttonsLabel,
    buttonsHint,
    onButtonsChange,
    rules,
    ruleValue,
    onToggleRule,
    onClose,
  } = props;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `closing` mantém o componente montado durante a animação de saída.
  const [closing, setClosing] = useState(false);

  // Reset SEM effect: ao reabrir, zera o estado de saída pra a animação de
  // entrada rodar limpa (mesmo padrão do drawer de variáveis).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && closing) setClosing(false);
  }

  // Fecha de verdade: ZERA `closing` (senão o véu fica preso cobrindo a tela —
  // bug do "não dá pra fechar") e avisa o pai (onClose).
  const finishClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setClosing(false);
    onClose();
  }, [onClose]);

  // Pede o fechamento: dispara a saída e fecha quando ela termina
  // (onAnimationEnd) — com fallback por timeout (reduced-motion).
  const requestClose = useCallback(() => {
    setClosing(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(finishClose, 360);
  }, [finishClose]);

  const handleAnimEnd = useCallback(() => {
    if (!closing) return;
    finishClose();
  }, [closing, finishClose]);

  // Limpa o timer no unmount.
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Fechar no Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  // Ao abrir: cancela timer de fechamento pendente + foca o campo (mensagem) ou
  // o painel (ajustes). Limpar timer/foco é side-effect — ok dentro de effect.
  useEffect(() => {
    if (open) {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      if (!isSettings && fieldRef.current) fieldRef.current.focus();
      else panelRef.current?.focus();
    }
  }, [open, isSettings]);

  // Mantém montado enquanto fecha (`closing`) para a animação de saída rodar.
  if (!open && !closing) return null;

  return (
    <div
      className={`hbx-veil to-right${closing ? " bot-phase-veil--closing" : ""}`}
      onClick={e => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        className={`hbx-drawer bot-phase-editor${closing ? " bot-phase-editor--closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Editar peça: ${title}`}
        tabIndex={-1}
        onAnimationEnd={handleAnimEnd}
      >
        <header className="bot-phase-editor__head">
          <span className="bot-phase-editor__icon" style={{ ["--bot-phase-color" as string]: tone }}>
            <I d={ICONS[icon] || ICONS.msg} size={16} />
          </span>
          <span className="bot-phase-editor__titles">
            <span className="bot-phase-editor__title">{title}</span>
            <span className="bot-phase-editor__hint">{hint}</span>
          </span>
          <button
            type="button"
            className="bot-phase-editor__close"
            aria-label="Fechar"
            title="Fechar"
            onClick={requestClose}
          >
            ✕
          </button>
        </header>

        <div className="bot-phase-editor__body">
          {isSettings ? (
            <div className="bot-phase-editor__rules">
              {rules.map(r => (
                <div className="setting" key={r.key}>
                  <div className="bot-phase-editor__rule-info">
                    <strong>{r.label}</strong>
                    <small>{r.hint}</small>
                  </div>
                  <button
                    className={"sw" + (ruleValue(r.key) ? " on" : "")}
                    role="switch"
                    aria-checked={ruleValue(r.key)}
                    aria-label={r.label}
                    onClick={() => onToggleRule(r.key)}
                  >
                    <i></i>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <>
              <label className="bot-phase-editor__label">Mensagem desta fase</label>
              <textarea
                ref={fieldRef}
                className="field-dark bot-phase-editor__field"
                value={value}
                onFocus={e => { fieldRef.current = e.currentTarget; onFocusField(e.currentTarget); }}
                onChange={e => { fieldRef.current = e.currentTarget; onFocusField(e.currentTarget); onChange(e.target.value); }}
                placeholder="Escreva a mensagem desta fase…"
              />
              <div className="bot-phase-editor__tools">
                <button
                  type="button"
                  className="btn-ghost bot-phase-editor__var-btn"
                  title="Inserir variável nesta mensagem"
                  onClick={() => onOpenVariables(fieldRef.current)}
                >
                  <I d={ICONS.bolt} size={12} /> Variáveis
                </button>
              </div>

              {showButtons && (
                <div className="bot-phase-editor__buttons">
                  <BotButtonsEditor
                    buttons={buttons}
                    actionCatalog={actionCatalog}
                    canUseOfficialButtons={canUseOfficialButtons}
                    label={buttonsLabel}
                    hint={buttonsHint}
                    onChange={onButtonsChange}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <footer className="bot-phase-editor__foot">
          <button type="button" className="btn-teal bot-phase-editor__done" onClick={requestClose}>
            <I d={ICONS.check} size={13} /> Concluir peça
          </button>
        </footer>
      </div>
    </div>
  );
}

export default BotPhaseEditor;
