"use client";

// BotPhaseEditor — editor DESLIZANTE compartilhado pelos 3 modos de montagem
// (Tabuleiro / Trilha / Bandeja) do Construtor de Bot. Desliza da DIREITA e
// edita UMA peça (fase do bot) por vez: título + textarea da mensagem + botão
// "Variáveis" (expande picker inline) + <BotButtonsEditor> (quando a peça emite botões).
// Para a peça "Ajustes" mostra os toggles de regras (BOT_RULES).
//
// Casca/animação vêm do contrato CENTRAL useHbxPresence + motion-system;
// o visual do conteúdo mora em hbx-theme/bot-builder.css (zero hex/inline color).

import { useEffect, useMemo, useRef, useState } from "react";

import { useHbxPresence } from "@/components/hbx/motion";
import { I, ICONS } from "@/components/hbx/shell";
import { BotButtonsEditor, type BotButton, type BotAction } from "@/components/hbx/bot-buttons-editor";
import type { VarDef } from "@/components/hbx/bot-variables-drawer";

// Espelha o tipo de regra da página (chave + label).
export type PhaseRuleDef = {
  key: string;
  label: string;
};

export type BotPhaseEditorProps = {
  open: boolean;
  // Identidade visual da peça
  title: string;
  icon: string; // chave em ICONS
  tone: string; // token central (var(--hbx-*)) — vira --bot-phase-color no CSS
  // Peça "Ajustes" (regras) vs. peça de mensagem
  isSettings: boolean;
  // ── Peça de mensagem ──
  value: string;
  onChange: (next: string) => void;
  onFocusField: (el: HTMLTextAreaElement | null) => void;
  onOpenVariables?: (el: HTMLTextAreaElement | null) => void;
  // catálogo de variáveis para o picker inline (quando presente, substitui o drawer externo)
  variableCatalog?: VarDef[];
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
    icon,
    tone,
    isSettings,
    value,
    onChange,
    onFocusField,
    onOpenVariables,
    variableCatalog = [],
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
  const presence = useHbxPresence(open, { kind: "drawer", onExited: onClose });
  const requestClose = presence.requestClose;

  // ── Picker inline de variáveis ────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  const filteredVars = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return variableCatalog;
    return variableCatalog.filter(v =>
      v.label.toLowerCase().includes(q) ||
      v.key.toLowerCase().includes(q) ||
      (v.description || "").toLowerCase().includes(q)
    );
  }, [variableCatalog, pickerQuery]);

  function handleInsertVar(token: string) {
    const el = fieldRef.current;
    const start = el ? el.selectionStart ?? value.length : value.length;
    const end = el ? el.selectionEnd ?? value.length : value.length;
    const novo = value.slice(0, start) + token + value.slice(end);
    onChange(novo);
    const caret = start + token.length;
    requestAnimationFrame(() => {
      const node = fieldRef.current;
      if (node) {
        node.focus();
        try { node.setSelectionRange(caret, caret); } catch { /* noop */ }
      }
    });
    setPickerOpen(false);
  }

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

  // Ao abrir: foca o campo (mensagem) ou o painel (ajustes).
  useEffect(() => {
    if (open) {
      if (!isSettings && fieldRef.current) fieldRef.current.focus();
      else panelRef.current?.focus();
    }
  }, [open, isSettings]);

  if (!presence.mounted) return null;

  return (
    <div
      {...presence.motionProps}
      className="hbx-veil to-right"
      onClick={e => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        className="hbx-drawer bot-phase-editor"
        role="dialog"
        aria-modal="true"
        aria-label={`Editar peça: ${title}`}
        tabIndex={-1}
      >
        <header className="bot-phase-editor__head">
          <span className="bot-phase-editor__icon" style={{ ["--bot-phase-color" as string]: tone }}>
            <I d={ICONS[icon] || ICONS.msg} size={16} />
          </span>
          <span className="bot-phase-editor__titles">
            <span className="bot-phase-editor__title">{title}</span>
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
                  className={"btn-ghost bot-phase-editor__var-btn" + (pickerOpen ? " is-active" : "")}
                  title="Inserir variável nesta mensagem"
                  onClick={() => {
                    if (variableCatalog.length > 0) {
                      setPickerOpen(v => !v);
                    } else {
                      onOpenVariables?.(fieldRef.current);
                    }
                  }}
                >
                  <I d={ICONS.bolt} size={12} /> Variáveis
                </button>
              </div>

              {/* Picker inline de variáveis — expande abaixo do textarea */}
              {variableCatalog.length > 0 && (
                <div className={"bot-phase-vars" + (pickerOpen ? " is-open" : "")} aria-hidden={!pickerOpen}>
                  <div className="bot-phase-vars__inner">
                    <div className="bot-phase-vars__content">
                      <input
                        className="field-dark bot-phase-vars__search"
                        type="search"
                        placeholder="Buscar variável…"
                        value={pickerQuery}
                        onChange={e => setPickerQuery(e.target.value)}
                        tabIndex={pickerOpen ? 0 : -1}
                        aria-label="Buscar variável"
                      />
                      {filteredVars.length === 0 ? (
                        <p className="bot-phase-vars__empty">Nenhuma variável encontrada.</p>
                      ) : (
                        <div className="bot-phase-vars__list">
                          {filteredVars.map(v => (
                            <button
                              key={v.key}
                              type="button"
                              className="bot-phase-vars__item"
                              tabIndex={pickerOpen ? 0 : -1}
                              onClick={() => handleInsertVar(`{{${v.key}}}`)}
                            >
                              <span className="bot-phase-vars__name">{v.label}</span>
                              <code className="bot-phase-vars__token">{`{{${v.key}}}`}</code>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

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
