"use client";

// BotFlowCanvas — organograma do Construtor de Bot (peça B do rebuild).
// DERIVA um grafo da config (nós = fases/mensagens; arestas = botão→nextNodeId)
// e o monta ao vivo: nó ACENDE quando a fase tem conteúdo, fica fantasma quando
// vazia; activeStep destaca o nó em edição. Auto-layout fixo por fase (não é
// editor arrastável). Visual herda a linguagem do canvas legado, mas TODO estilo
// vive em hbx-theme/bot-flow.css (zero hex/inline color — só layout inline).
//
// Não importado por ninguém ainda — a etapa E costura na tela /bot.

import React, { useMemo } from "react";

import { I, ICONS } from "@/components/hbx/shell";

// ─── Tipos (espelham o contrato do INDICE / page.client.tsx) ──────────────────

export type BotButton = { buttonId: string; actionId: string; title: string; nextNodeId?: string };

type BotConfigLike = {
  welcomeMessage?: string;
  returningCustomerMessage?: string;
  mainMenuPrompt?: string;
  postActionPrompt?: string;
  humanAckMessage?: string;
  closeTopicMessage?: string;
  blockedMessage?: string;
  welcomeButtons?: BotButton[];
  mainMenuButtons?: BotButton[];
};

// Aceita a BotConfig completa da tela; só usamos os campos acima.
export type BotFlowCanvasProps = {
  config: BotConfigLike;
  activeStep?: string; // chave da fase em foco (ex.: 'mainMenuPrompt')
  // Clicar num nó → abre o editor deslizante daquela peça (modo Tabuleiro).
  // Opcional: sem ele o canvas continua só-leitura (mobile / legado).
  onPickNode?: (key: string) => void;
};

// ─── Definição estática das fases (nós) ───────────────────────────────────────
// `key` = chave da config (também o nextNodeId esperado das arestas).
// `col`/`row` = posição na grade fixa (auto-layout simples).

type PhaseKey = keyof BotConfigLike;

type PhaseDef = {
  key: PhaseKey;          // campo de mensagem da config
  label: string;
  icon: string;           // chave em ICONS
  color: string;          // token central (var(--hbx-*))
  col: number;            // coluna na grade
  row: number;            // linha na grade
  buttonsKey?: "welcomeButtons" | "mainMenuButtons"; // grupo de botões saindo do nó
};

// Layout em grade: linha 0 = trilho principal; linha 1 = ramos.
const PHASES: PhaseDef[] = [
  { key: "welcomeMessage",           label: "Boas-vindas",   icon: "msg",   color: "var(--hbx-brand)",     col: 0, row: 0, buttonsKey: "welcomeButtons" },
  { key: "mainMenuPrompt",           label: "Menu",          icon: "atend", color: "var(--hbx-info)",      col: 1, row: 0, buttonsKey: "mainMenuButtons" },
  { key: "postActionPrompt",         label: "Pós-ação",      icon: "check", color: "var(--hbx-success)",   col: 2, row: 0 },
  { key: "closeTopicMessage",        label: "Encerramento",  icon: "clock", color: "var(--hbx-secondary)", col: 3, row: 0 },
  { key: "returningCustomerMessage", label: "Retorno",       icon: "reply", color: "var(--hbx-info)",      col: 0, row: 1 },
  { key: "humanAckMessage",          label: "Humano",        icon: "users", color: "var(--hbx-warning)",   col: 2, row: 1 },
  { key: "blockedMessage",           label: "Bloqueado",     icon: "x",     color: "var(--hbx-danger)",    col: 3, row: 1 },
];

// Geometria da grade (px). O palco é dimensionado a partir disso.
const NODE_W = 200;
const NODE_H = 120;        // altura aproximada p/ ancorar fios
const GAP_X = 60;
const GAP_Y = 90;
const PAD = 28;

const COL_STEP = NODE_W + GAP_X;
const ROW_STEP = NODE_H + GAP_Y;

function nodeX(col: number): number { return PAD + col * COL_STEP; }
function nodeY(row: number): number { return PAD + row * ROW_STEP; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

// Prévia do card: colapsa quebras de linha em espaço (texto com \n literal —
// Enter digitado no editor da peça — já confunde o cálculo de wrap do
// navegador) e corta num orçamento de caracteres calibrado pra nunca passar
// de ~3 linhas na largura do nó (200px, 0.7rem). Isso é o que garante ZERO
// vazamento sobre o rodapé "Pronto" com qualquer tamanho de texto: o
// -webkit-line-clamp do CSS (bot-flow.css) é só reforço — em telas com DPI
// fracionário o Chrome deixa a pintura da linha cortada vazar mesmo com a
// caixa medindo certo (bug visto ao vivo no card Boas-vindas), então a
// prévia não pode depender só do clamp do navegador.
const PREVIEW_MAX_CHARS = 95;

function previewText(v: unknown): string {
  if (typeof v !== "string") return "";
  const collapsed = v.replace(/\s+/g, " ").trim();
  if (collapsed.length <= PREVIEW_MAX_CHARS) return collapsed;
  const cut = collapsed.slice(0, PREVIEW_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  // corta na última palavra inteira (evita partir palavra no meio); só aceita
  // o corte por espaço se não jogar fora demais do orçamento.
  const safeCut = lastSpace > PREVIEW_MAX_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut;
  return safeCut.trimEnd() + "…";
}

// Botões de um nó (se a fase emite botões).
function buttonsOf(config: BotConfigLike, def: PhaseDef): BotButton[] {
  if (!def.buttonsKey) return [];
  const arr = config[def.buttonsKey];
  return Array.isArray(arr) ? arr : [];
}

// Um nó está "aceso" se a mensagem da fase está preenchida OU ele tem botões.
function isLit(config: BotConfigLike, def: PhaseDef): boolean {
  if (hasText(config[def.key])) return true;
  return buttonsOf(config, def).length > 0;
}

type EdgeGeo = {
  id: string;
  d: string;
  x2: number;
  y2: number;
  active: boolean; // ambos os nós acesos → fio "vivo"
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function BotFlowCanvas(props: BotFlowCanvasProps): React.ReactElement {
  const { config, activeStep, onPickNode } = props;

  // índice por key p/ resolver nextNodeId
  const byKey = useMemo(() => {
    const m = new Map<string, PhaseDef>();
    for (const p of PHASES) m.set(String(p.key), p);
    return m;
  }, []);

  // estado aceso por nó
  const litMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of PHASES) m.set(String(p.key), isLit(config, p));
    return m;
  }, [config]);

  // progresso: quantas fases já estão "prontas" (acesas) do total
  const litCount = useMemo(() => {
    let n = 0;
    for (const v of litMap.values()) if (v) n += 1;
    return n;
  }, [litMap]);
  const total = PHASES.length;
  const pct = total > 0 ? Math.round((litCount / total) * 100) : 0;

  // arestas derivadas dos botões → nextNodeId
  const edges = useMemo<EdgeGeo[]>(() => {
    const out: EdgeGeo[] = [];
    for (const def of PHASES) {
      const fromLit = litMap.get(String(def.key)) === true;
      for (const btn of buttonsOf(config, def)) {
        const target = btn.nextNodeId ? byKey.get(btn.nextNodeId) : undefined;
        if (!target) continue;
        // âncora: saída na direita-meio do nó origem; entrada na esquerda-meio do destino
        const x1 = nodeX(def.col) + NODE_W;
        const y1 = nodeY(def.row) + NODE_H / 2;
        const x2 = nodeX(target.col);
        const y2 = nodeY(target.row) + NODE_H / 2;
        // curva suave (mão direita) — herda a linguagem dos fios do canvas legado
        const sameRow = def.row === target.row;
        const d = sameRow
          ? `M ${x1} ${y1} C ${x1 + GAP_X * 0.6} ${y1}, ${x2 - GAP_X * 0.6} ${y2}, ${x2} ${y2}`
          : `M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`;
        const targetLit = litMap.get(String(target.key)) === true;
        out.push({
          id: `${def.key}->${target.key}:${btn.buttonId}`,
          d,
          x2,
          y2,
          active: fromLit && targetLit,
        });
      }
    }
    return out;
  }, [config, litMap, byKey]);

  // dimensão do palco
  const cols = PHASES.reduce((mx, p) => Math.max(mx, p.col), 0) + 1;
  const rows = PHASES.reduce((mx, p) => Math.max(mx, p.row), 0) + 1;
  const stageW = PAD * 2 + cols * NODE_W + (cols - 1) * GAP_X;
  const stageH = PAD * 2 + rows * NODE_H + (rows - 1) * GAP_Y;

  return (
    <div className="bfc" role="group" aria-label="Organograma do bot">
      {/* Barra de progresso da montagem: "X de N peças · Y%" */}
      <div className="bfc-progress" aria-label={`${litCount} de ${total} peças prontas, ${pct}%`}>
        <div className="bfc-progress-info">
          <strong className="bfc-progress-count">{litCount} de {total} peças</strong>
          <span className="bfc-progress-pct">{pct}%</span>
        </div>
        <div className="bfc-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span className={"bfc-progress-fill" + (pct >= 100 ? " bfc-progress-fill--full" : "")} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="bfc-legend" aria-hidden="true">
        <span className="bfc-legend-item"><span className="bfc-legend-dot bfc-legend-dot--lit" /> Pronto</span>
        <span className="bfc-legend-item"><span className="bfc-legend-dot bfc-legend-dot--ghost" /> Vazio</span>
        <span className="bfc-legend-item"><span className="bfc-legend-dot bfc-legend-dot--active" /> Em edição</span>
      </div>

      <div className="bfc-stage" style={{ width: stageW, height: stageH }}>
        <svg className="bfc-wires" width={stageW} height={stageH}>
          {edges.map((e, i) => (
            <g key={e.id} className={"bfc-edge" + (e.active ? "" : " bfc-edge--off")}>
              <path d={e.d} className="bfc-wire-base" stroke="currentColor" strokeWidth="2.4" fill="none" />
              <path
                d={e.d}
                className="bfc-wire-flow"
                stroke="currentColor"
                strokeWidth="1.8"
                fill="none"
                style={{ animationDelay: `-${(i * 0.31).toFixed(2)}s` }}
              />
              <circle
                cx={e.x2}
                cy={e.y2}
                r="4.5"
                fill="currentColor"
                className="bfc-wire-dot"
                style={{ animationDelay: `${(i * 0.6).toFixed(1)}s` }}
              />
            </g>
          ))}
        </svg>

        {PHASES.map((def) => {
          const lit = litMap.get(String(def.key)) === true;
          const active = activeStep === String(def.key);
          const btns = buttonsOf(config, def);
          const msg = config[def.key];
          const clickable = typeof onPickNode === "function";
          const cls =
            "bfc-node " +
            (lit ? "bfc-node--lit" : "bfc-node--ghost") +
            (active ? " bfc-node--active" : "") +
            (clickable ? " bfc-node--clickable" : "");
          const iconName = ICONS[def.icon] ? def.icon : "msg";
          const inner = (
            <>
              <div className="bfc-node-head">
                <span className="bfc-node-icon"><I d={ICONS[iconName]} size={16} /></span>
                <strong>{def.label}</strong>
              </div>
              <div className={"bfc-node-body" + (hasText(msg) ? "" : " bfc-node-body--empty")}>
                {hasText(msg) ? previewText(msg) : "Sem mensagem ainda"}
              </div>
              <div className={"bfc-node-foot" + (lit ? " bfc-node-foot--lit" : "")}>
                <span>{lit ? "Pronto" : "Vazio"}</span>
                {btns.length > 0 && (
                  <span className="bfc-node-badge">
                    {btns.length} <I d={ICONS.arrow} size={10} />
                  </span>
                )}
                {clickable && !lit && (
                  <span className="bfc-node-add" aria-hidden="true">
                    <I d={ICONS.plus} size={11} /> montar
                  </span>
                )}
              </div>
            </>
          );
          const nodeStyle = { left: nodeX(def.col), top: nodeY(def.row), ["--bfc-node-color" as string]: def.color };
          if (clickable) {
            return (
              <button
                key={String(def.key)}
                type="button"
                className={cls}
                style={nodeStyle}
                aria-label={(lit ? "Editar peça: " : "Montar peça: ") + def.label}
                onClick={() => onPickNode!(String(def.key))}
              >
                {inner}
              </button>
            );
          }
          return (
            <article
              key={String(def.key)}
              className={cls}
              style={nodeStyle}
              aria-label={def.label + (lit ? " — pronto" : " — vazio")}
            >
              {inner}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default BotFlowCanvas;
