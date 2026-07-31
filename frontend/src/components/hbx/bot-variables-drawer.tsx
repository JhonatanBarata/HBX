"use client";

// BotVariablesDrawer — o "castelo de variáveis" do Construtor de Bot.
// Gaveta que desliza da DIREITA com o catálogo de variáveis. Clicar numa
// variável insere o token {{key}} no campo que estava em foco (onInsert).
// Clicar no véu (fora do drawer) ou Esc recolhe com o efeito reverso (onClose).
//
// Reusa a presença e o vocabulário CENTRAIS de motion. Todo visual do conteúdo
// mora em hbx-theme/bot-variables.css.
//
// Parte D do rebuild (PLAN-BOT-REBUILD-D). Integração (importar este
// componente em bot/page.client.tsx) é a etapa E.

import { useEffect, useMemo, useRef, useState } from "react";

import { useHbxPresence } from "@/components/hbx/motion";

export type VarScope = "shared" | "atendimento" | "recovery";

export type VarDef = {
  key: string;
  label: string;
  example: string;
  description: string;
  scope: VarScope;
  required: boolean;
};

export type BotVariablesDrawerProps = {
  open: boolean;
  variableCatalog: VarDef[];
  onClose: () => void;
  onInsert: (token: string) => void;
};

const SCOPE_ORDER: VarScope[] = ["shared", "atendimento", "recovery"];

const SCOPE_TITLE: Record<VarScope, string> = {
  shared: "Gerais",
  atendimento: "Atendimento",
  recovery: "Recuperação",
};

export function BotVariablesDrawer({
  open,
  variableCatalog,
  onClose,
  onInsert,
}: BotVariablesDrawerProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const presence = useHbxPresence(open, { kind: "drawer", onExited: onClose });
  const requestClose = presence.requestClose;

  // Busca no catálogo (dezenas de variáveis não cabem numa lista rolável).
  const [query, setQuery] = useState("");

  // Reset SEM effect e SEM ler ref no render: guarda o `open` anterior em STATE e
  // ajusta durante o render (padrão React p/ "resetar estado quando prop muda" —
  // o setState no render re-renderiza na hora, sem commit intermediário). Ao reabrir,
  // zera o estado de saída pra animação de entrada rodar limpa + limpa a busca.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setQuery("");
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

  // Ao abrir: foco inicial no painel.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // Agrupa por scope na ordem fixa; só mostra grupos que têm variáveis.
  // Filtra pela busca (label, chave, token e descrição).
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (v: VarDef) =>
      !q ||
      v.label.toLowerCase().includes(q) ||
      v.key.toLowerCase().includes(q) ||
      (v.description || "").toLowerCase().includes(q);
    return SCOPE_ORDER.map(scope => ({
      scope,
      items: variableCatalog.filter(v => v.scope === scope && match(v)),
    })).filter(g => g.items.length > 0);
  }, [variableCatalog, query]);

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
        className="hbx-drawer bot-vars"
        role="dialog"
        aria-modal="true"
        aria-label="Catálogo de variáveis"
        tabIndex={-1}
        style={{ display: "flex", flexDirection: "column" }}
      >
        <header className="bot-vars-head">
          <h3 className="bot-vars-title">Variáveis</h3>
          <button
            type="button"
            className="bot-vars-close"
            aria-label="Fechar"
            onClick={requestClose}
          >
            ✕
          </button>
        </header>

        <p className="bot-vars-hint">
          Clique numa variável para inserir no campo selecionado.
        </p>

        <div className="bot-vars-search">
          <input
            className="field-dark"
            type="search"
            placeholder="Buscar variável…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Buscar variável"
          />
        </div>

        <div className="bot-vars-scroll" style={{ flex: 1, overflowY: "auto" }}>
          {groups.length === 0 ? (
            <p className="bot-vars-empty">
              {query.trim() ? "Nenhuma variável encontrada." : "Nenhuma variável disponível."}
            </p>
          ) : (
            groups.map(group => (
              <section key={group.scope} className="bot-vars-group">
                <h4 className="bot-vars-group-title">{SCOPE_TITLE[group.scope]}</h4>
                <ul className="bot-vars-list">
                  {group.items.map(v => (
                    <li key={v.key}>
                      <button
                        type="button"
                        className="bot-vars-item"
                        onClick={() => onInsert(`{{${v.key}}}`)}
                      >
                        <span className="bot-vars-item-top">
                          <span className="bot-vars-label">{v.label}</span>
                          {v.required && (
                            <span className="bot-vars-req">obrigatória</span>
                          )}
                        </span>
                        <code className="bot-vars-token">{`{{${v.key}}}`}</code>
                        {v.example && (
                          <span className="bot-vars-example">{v.example}</span>
                        )}
                        {v.description && (
                          <span className="bot-vars-desc">{v.description}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
