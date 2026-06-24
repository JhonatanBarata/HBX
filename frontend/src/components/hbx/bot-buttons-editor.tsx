"use client";

/**
 * BotButtonsEditor — editor de um grupo de botões do bot que se ADAPTA ao canal.
 *
 * Peça C do rebuild do Construtor de Bot (ver docs/PLANEJAMENTOS/PR24062026/
 * PLAN-BOT-REBUILD-C-BOTOES.md). Componente isolado, dirigido por `onChange`
 * (sem estado global da página) — a etapa E o integra em /bot.
 *
 * Modos (de providerCapabilities, Parte A):
 *  - Meta  (canUseOfficialButtons=true)  → botões interativos: Texto (até 60) + Ação.
 *  - QR    (canUseOfficialButtons=false) → opções numeradas (1,2,3…) + aviso do modo.
 *    O bot injeta "1) … 2) …" no corpo e o cliente responde o número.
 *
 * Em AMBOS os modos o `actionId` é escolhido do `actionCatalog`; a numeração do
 * modo QR é só apresentação. Estilo vive em hbx-theme/bot-buttons.css (5 Leis).
 */

import type { ReactElement } from "react";

import { I, ICONS } from "@/components/hbx/shell";

// Contrato (espelha os tipos do INDICE / bot/page.client.tsx).
export type BotButton = { buttonId: string; actionId: string; title: string; nextNodeId?: string };
export type BotAction = { actionId: string; title?: string; description?: string; route?: string; kind?: string; enabled?: boolean };

export type BotButtonsEditorProps = {
  buttons: BotButton[];              // grupo atual
  actionCatalog: BotAction[];        // ações disponíveis (filtra enabled !== false)
  canUseOfficialButtons: boolean;    // de providerCapabilities (Parte A)
  label?: string;
  hint?: string;
  onChange: (next: BotButton[]) => void;
};

const MAX_TITLE = 60;

function novoButtonId(): string {
  return `btn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function BotButtonsEditor({
  buttons,
  actionCatalog,
  canUseOfficialButtons,
  label,
  hint,
  onChange,
}: BotButtonsEditorProps): ReactElement {
  const acoes = (actionCatalog || []).filter(a => a.enabled !== false);
  const itens = buttons || [];

  function editar(idx: number, patch: Partial<BotButton>) {
    const next = itens.map((b, i) => (i === idx ? { ...b, ...patch } : { ...b }));
    onChange(next);
  }

  function adicionar() {
    onChange([...itens.map(b => ({ ...b })), { buttonId: novoButtonId(), actionId: "", title: "" }]);
  }

  function remover(idx: number) {
    onChange(itens.filter((_, i) => i !== idx));
  }

  const addLabel = canUseOfficialButtons ? "Adicionar botão" : "Adicionar opção";
  const emptyLabel = canUseOfficialButtons
    ? "Sem botões — adicione o primeiro."
    : "Sem opções — adicione a primeira.";
  const txtPlaceholder = canUseOfficialButtons ? "Texto do botão" : "Texto da opção";

  return (
    <div className="bot-btns">
      {(label || hint) && (
        <div className="bot-btns__head">
          {label && (
            <label className="bot-btns__label">
              {label}
              {hint && <span className="bot-btns__hint"> · {hint}</span>}
            </label>
          )}
        </div>
      )}

      {canUseOfficialButtons ? (
        <p className="bot-btns__mode bot-btns__mode--meta">
          <span className="bot-btns__mode-dot" aria-hidden="true" />
          <span>Conexão oficial (Meta) — botões clicáveis. Cada botão tem texto e uma ação.</span>
        </p>
      ) : (
        <p className="bot-btns__mode">
          <span className="bot-btns__mode-dot" aria-hidden="true" />
          <span>Sua conexão é QR — usamos opções numeradas, sem botão clicável. O cliente responde o número (1, 2, 3…).</span>
        </p>
      )}

      {itens.length === 0 && <span className="bot-btns__empty">{emptyLabel}</span>}

      {itens.length > 0 && (
        <div className="bot-btns__list">
          {itens.map((b, i) => (
            <div className="bot-btns__row" key={b.buttonId || i}>
              <span
                className={canUseOfficialButtons ? "bot-btns__badge bot-btns__badge--meta" : "bot-btns__badge"}
                aria-hidden="true"
                title={canUseOfficialButtons ? "Botão" : `Opção ${i + 1}`}
              >
                {canUseOfficialButtons ? <I d={ICONS.bolt} size={12} /> : i + 1}
              </span>

              <input
                className="field-dark"
                maxLength={MAX_TITLE}
                placeholder={txtPlaceholder}
                value={b.title}
                onChange={e => editar(i, { title: e.target.value })}
                aria-label={canUseOfficialButtons ? "Texto do botão" : `Texto da opção ${i + 1}`}
              />

              <select
                className="field-dark"
                value={b.actionId}
                onChange={e => editar(i, { actionId: e.target.value })}
                aria-label="Ação"
              >
                <option value="">Ação…</option>
                {acoes.map(a => (
                  <option key={a.actionId} value={a.actionId}>
                    {a.title || a.actionId}
                  </option>
                ))}
                {b.actionId && !acoes.some(a => a.actionId === b.actionId) && (
                  <option value={b.actionId}>{b.actionId}</option>
                )}
              </select>

              <button
                type="button"
                className="icon-ghost"
                title={canUseOfficialButtons ? "Remover botão" : "Remover opção"}
                aria-label={canUseOfficialButtons ? "Remover botão" : "Remover opção"}
                onClick={() => remover(i)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn-ghost bot-btns__add" onClick={adicionar}>
        <I d={ICONS.plus} size={12} /> {addLabel}
      </button>

      <p className="bot-btns__foot">
        {canUseOfficialButtons
          ? "Cada botão dispara uma ação do catálogo do bot."
          : "Cada opção vira um número na mensagem e dispara uma ação do catálogo do bot."}
      </p>
    </div>
  );
}
