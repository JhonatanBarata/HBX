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
  const { config, activeStep } = props;

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
          const cls =
            "bfc-node " +
            (lit ? "bfc-node--lit" : "bfc-node--ghost") +
            (active ? " bfc-node--active" : "");
          const iconName = ICONS[def.icon] ? def.icon : "msg";
          return (
            <article
              key={String(def.key)}
              className={cls}
              style={{ left: nodeX(def.col), top: nodeY(def.row), ["--bfc-node-color" as string]: def.color }}
              aria-label={def.label + (lit ? " — pronto" : " — vazio")}
            >
              <div className="bfc-node-head">
                <span className="bfc-node-icon"><I d={ICONS[iconName]} size={16} /></span>
                <strong>{def.label}</strong>
              </div>
              <div className={"bfc-node-body" + (hasText(msg) ? "" : " bfc-node-body--empty")}>
                {hasText(msg) ? (msg as string) : "Sem mensagem ainda"}
              </div>
              <div className={"bfc-node-foot" + (lit ? " bfc-node-foot--lit" : "")}>
                <span>{lit ? "Pronto" : "Vazio"}</span>
                {btns.length > 0 && (
                  <span className="bfc-node-badge">
                    {btns.length} <I d={ICONS.arrow} size={10} />
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default BotFlowCanvas;
