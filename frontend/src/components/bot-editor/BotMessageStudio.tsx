"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import styles from "./BotMessageStudio.module.css";

export type BotStudioVariable = {
  key: string;
  label: string;
  example: string;
  scopeLabel: string;
  categoryLabel?: string;
  originLabel?: string;
  required?: boolean;
};

export type BotStudioButton = {
  buttonId: string;
  actionId: string;
  title: string;
  nextNodeId?: string;
  nextLabel?: string;
};

export type BotStudioAction = {
  actionId: string;
  title: string;
  description: string;
  routeLabel?: string;
  typeLabel?: string;
  enabled?: boolean;
};

export type BotStudioFlowScenario = {
  id: string;
  label: string;
  description: string;
  badge?: string;
  nodeKind?: "template" | "message" | "action" | "human_handoff" | "end";
  supportsButtons?: boolean;
  editable?: boolean;
  messageText: string;
  buttons: BotStudioButton[];
  position?: { x: number; y: number };
  effectLabel?: string;
  toneLabel?: string;
};

export type BotStudioFlowEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

export type BotStudioTemplateStart = {
  id?: string;
  title: string;
  description: string;
  body: string;
  footer?: string | null;
  buttons?: string[];
  badges?: string[];
  tone?: "ready" | "warning";
};

export type BotStudioTemplateOption = {
  id: string;
  title: string;
  subtitle?: string;
  selected?: boolean;
  ready?: boolean;
  issues?: string[];
};

export type BotStudioPublicationCheck = {
  id: string;
  label: string;
  description: string;
  ok: boolean;
};

type ActionOption = {
  value: string;
  label: string;
};

type BotMessageStudioProps = {
  eyebrow: string;
  title: string;
  description: string;
  flowScenarios: BotStudioFlowScenario[];
  flowEdges?: BotStudioFlowEdge[];
  startNodeId?: string;
  selectedScenarioId: string;
  onSelectScenario: (scenarioId: string) => void;
  messageText: string;
  onMessageTextChange: (value: string) => void;
  messageType: "simple" | "buttons";
  onMessageTypeChange: (nextType: "simple" | "buttons") => void;
  buttons: BotStudioButton[];
  actionOptions: ActionOption[];
  actionById: Record<string, BotStudioAction>;
  catalogActions: BotStudioAction[];
  onUpdateButton: (index: number, field: "buttonId" | "actionId" | "title", value: string) => void;
  onAddButton: () => void;
  onRemoveButton: (index: number) => void;
  variables: BotStudioVariable[];
  catalogVariables: BotStudioVariable[];
  onAppendVariable: (variableKey: string) => void;
  previewText: string;
  previewFooter?: string | null;
  previewFallbackText: string;
  previewNote?: string | null;
  templateStart?: BotStudioTemplateStart | null;
  templateOptions?: BotStudioTemplateOption[];
  onSelectTemplateOption?: (templateId: string) => void;
  publicationChecks?: BotStudioPublicationCheck[];
  publicationTitle?: string;
  publicationDescription?: string;
  publicationStatusLabel?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
  variablesTabExtra?: ReactNode;
  actionsTabExtra?: ReactNode;
  publicationTabExtra?: ReactNode;
  loading?: boolean;
};

type StudioTab = "flow" | "preview" | "variables" | "actions" | "publication";

function extractVariableKeys(message: string) {
  return Array.from(
    new Set(
      String(message || "").match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)?.map((token) => {
        return token.replace(/\{\{|\}\}/g, "").trim();
      }) || [],
    ),
  );
}

function getNodeKindLabel(kind?: BotStudioFlowScenario["nodeKind"]) {
  switch (kind) {
    case "template":
      return "Template";
    case "action":
      return "Acao";
    case "human_handoff":
      return "Humano";
    case "end":
      return "Encerrar";
    default:
      return "Mensagem";
  }
}

function isEditableNode(node: BotStudioFlowScenario | null) {
  return Boolean(node && node.editable !== false && node.nodeKind !== "template" && node.nodeKind !== "action");
}

export default function BotMessageStudio(props: BotMessageStudioProps) {
  const {
    eyebrow,
    title,
    description,
    flowScenarios,
    flowEdges = [],
    startNodeId,
    selectedScenarioId,
    onSelectScenario,
    messageText,
    onMessageTextChange,
    messageType,
    onMessageTypeChange,
    buttons,
    actionOptions,
    actionById,
    catalogActions,
    onUpdateButton,
    onAddButton,
    onRemoveButton,
    variables,
    catalogVariables,
    onAppendVariable,
    previewText,
    previewFooter,
    previewFallbackText,
    previewNote,
    templateStart,
    templateOptions = [],
    onSelectTemplateOption,
    publicationChecks = [],
    publicationTitle = "Publicacao",
    publicationDescription = "Valide se o builder esta legivel, previsivel e pronto para seguir como rascunho confiavel.",
    publicationStatusLabel,
    primaryActionLabel = "Salvar editor",
    onPrimaryAction,
    primaryActionDisabled = false,
    variablesTabExtra,
    actionsTabExtra,
    publicationTabExtra,
    loading = false,
  } = props;

  const [activeTab, setActiveTab] = useState<StudioTab>("flow");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 72, y: 48 });
  const [previewTrail, setPreviewTrail] = useState<string[]>([startNodeId || selectedScenarioId]);
  const dragStateRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const selectedScenario =
    flowScenarios.find((scenario) => scenario.id === selectedScenarioId) || flowScenarios[0] || null;
  const supportsButtons = Boolean(
    selectedScenario &&
      selectedScenario.supportsButtons !== false &&
      selectedScenario.nodeKind !== "template" &&
      selectedScenario.nodeKind !== "action",
  );
  const nodeById = useMemo(
    () => new Map(flowScenarios.map((scenario, index) => [scenario.id, { ...scenario, position: scenario.position || { x: 320 * index, y: 120 } }])),
    [flowScenarios],
  );
  const selectedNode = nodeById.get(selectedScenarioId) || selectedScenario || null;
  const startNode = nodeById.get(startNodeId || "") || nodeById.get(templateStart?.id || "") || flowScenarios[0] || null;

  const variableUsage = useMemo(() => {
    const entries = catalogVariables.map((variable) => {
      const usedIn = flowScenarios
        .filter((scenario) => extractVariableKeys(scenario.messageText).includes(variable.key))
        .map((scenario) => scenario.label);
      return [variable.key, usedIn] as const;
    });
    return Object.fromEntries(entries);
  }, [catalogVariables, flowScenarios]);

  const actionUsage = useMemo(() => {
    const next = new Map<string, Array<{ scenarioLabel: string; buttonLabel: string }>>();
    for (const scenario of flowScenarios) {
      for (const button of scenario.buttons) {
        const current = next.get(button.actionId) || [];
        current.push({
          scenarioLabel: scenario.label,
          buttonLabel: button.title || button.buttonId,
        });
        next.set(button.actionId, current);
      }
    }
    return next;
  }, [flowScenarios]);

  const graphBounds = useMemo(() => {
    const points = flowScenarios.map((node, index) => node.position || { x: 320 * index, y: 120 });
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs, 0);
    const minY = Math.min(...ys, 0);
    const maxX = Math.max(...xs, 1480) + 280;
    const maxY = Math.max(...ys, 560) + 180;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [flowScenarios]);

  const previewNodeId = previewTrail[previewTrail.length - 1] || startNode?.id || selectedScenarioId;
  const previewNode = nodeById.get(previewNodeId) || startNode || null;
  const previewNodeButtons = previewNode?.buttons || [];

  const activeQuickInsertKeys = useMemo(() => new Set(variables.map((item) => item.key)), [variables]);
  const publicationReady = publicationChecks.length > 0 && publicationChecks.every((item) => item.ok);
  const computedPublicationStatus =
    publicationStatusLabel || (publicationReady ? "Fluxo pronto para salvar" : "Rascunho com pontos para revisar");

  const tabItems: Array<{ id: StudioTab; label: string; helper: string }> = [
    { id: "flow", label: "Fluxo", helper: `${flowScenarios.length} blocos` },
    { id: "preview", label: "Preview", helper: "Conversa real" },
    { id: "variables", label: "Variaveis", helper: `${catalogVariables.length} itens` },
    { id: "actions", label: "Acoes", helper: `${catalogActions.length} rotas` },
    { id: "publication", label: "Publicacao", helper: publicationReady ? "Pronto" : "Rascunho" },
  ];

  function handleSelectNode(nodeId: string) {
    onSelectScenario(nodeId);
    setPreviewTrail([startNode?.id || nodeId]);
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(`.${styles.flowCanvasNode}`)) return;
    dragStateRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragStateRef.current.x;
    const deltaY = event.clientY - dragStateRef.current.y;
    dragStateRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setPan((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
  }

  function handleCanvasPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
    if ((event.currentTarget as HTMLDivElement).hasPointerCapture(event.pointerId)) {
      (event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId);
    }
  }

  function handlePreviewAdvance(button: BotStudioButton) {
    if (!button.nextNodeId || !nodeById.has(button.nextNodeId)) return;
    setPreviewTrail((current) => [...current, button.nextNodeId as string]);
  }

  function renderFlowTab() {
    return (
      <div className={styles.flowLayout}>
        <aside className={`${styles.panel} ${styles.libraryPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <strong>Biblioteca do fluxo</strong>
              <p>O builder agora mostra o fluxo inteiro e nao apenas o bloco isolado.</p>
            </div>
          </div>

          <div className={styles.paletteGrid}>
            <span className={`${styles.libraryChip} ${styles.libraryChipAccent}`}>Template inicial</span>
            <span className={styles.libraryChip}>Mensagem</span>
            <span className={styles.libraryChip}>Botoes</span>
            <span className={styles.libraryChip}>Acao</span>
            <span className={styles.libraryChip}>Encerrar</span>
            <span className={styles.libraryChip}>Humano</span>
          </div>

          <div className={styles.scenarioList}>
            {flowScenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className={`${styles.scenarioItem} ${
                  scenario.id === selectedScenarioId ? styles.scenarioItemActive : ""
                }`}
                onClick={() => handleSelectNode(scenario.id)}
              >
                <div className={styles.scenarioTitleRow}>
                  <strong>{scenario.label}</strong>
                  <span className={styles.badge}>{scenario.badge || getNodeKindLabel(scenario.nodeKind)}</span>
                </div>
                <p>{scenario.description}</p>
                <div className={styles.scenarioMeta}>
                  <span className={`${styles.badge} ${styles.badgeMuted}`}>{getNodeKindLabel(scenario.nodeKind)}</span>
                  <span className={`${styles.badge} ${styles.badgeMuted}`}>
                    {scenario.buttons.length > 0 ? `${scenario.buttons.length} botoes` : "Sem botoes"}
                  </span>
                  <span className={`${styles.badge} ${styles.badgeMuted}`}>
                    {extractVariableKeys(scenario.messageText).length} variaveis
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className={`${styles.panel} ${styles.canvasPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <strong>Canvas completo do fluxo</strong>
              <p>Leitura ponta a ponta com conexoes reais, no ativo destacado, zoom e navegacao por nos.</p>
            </div>
            <div className={styles.canvasStatus}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setZoom((current) => Math.max(0.72, Number((current - 0.12).toFixed(2))))}>-</button>
              <span className={`${styles.badge} ${styles.badgeAccent}`}>{Math.round(zoom * 100)}%</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setZoom((current) => Math.min(1.4, Number((current + 0.12).toFixed(2))))}>+</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setZoom(1); setPan({ x: 72, y: 48 }); }}>
                Resetar vista
              </button>
            </div>
          </div>

          <div
            className={styles.canvasSurface}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
          >
            <div className={styles.canvasViewport}>
              <div
                className={styles.canvasTransform}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  width: graphBounds.width,
                  height: graphBounds.height,
                }}
              >
                <svg className={styles.flowSvg} viewBox={`0 0 ${graphBounds.width} ${graphBounds.height}`}>
                  {flowEdges.map((edge) => {
                    const from = nodeById.get(edge.from);
                    const to = nodeById.get(edge.to);
                    if (!from?.position || !to?.position) return null;
                    const startX = from.position.x + 124 - graphBounds.minX;
                    const startY = from.position.y + 74 - graphBounds.minY;
                    const endX = to.position.x + 124 - graphBounds.minX;
                    const endY = to.position.y + 18 - graphBounds.minY;
                    const midX = (startX + endX) / 2;
                    const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
                    return (
                      <g key={edge.id}>
                        <path d={path} className={styles.flowEdgePath} />
                        {edge.label ? (
                          <text x={midX} y={(startY + endY) / 2 - 8} className={styles.flowEdgeLabel}>
                            {edge.label}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </svg>

                {flowScenarios.map((node) => {
                  const position = node.position || { x: 0, y: 0 };
                  const active = node.id === selectedScenarioId;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={`${styles.flowCanvasNode} ${active ? styles.flowCanvasNodeActive : ""}`}
                      style={{ left: position.x - graphBounds.minX, top: position.y - graphBounds.minY }}
                      onClick={() => handleSelectNode(node.id)}
                    >
                      <span className={styles.flowNodeEyebrow}>{getNodeKindLabel(node.nodeKind)}</span>
                      <strong>{node.label}</strong>
                      <p>{node.description}</p>
                      <div className={styles.nodeBadgeRow}>
                        {node.badge ? <span className={styles.badge}>{node.badge}</span> : null}
                        {node.buttons.length > 0 ? (
                          <span className={`${styles.badge} ${styles.badgeMuted}`}>{node.buttons.length} saídas</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className={styles.minimap}>
              <strong>Mini mapa</strong>
              <div className={styles.minimapFrame}>
                {flowScenarios.map((node) => {
                  const position = node.position || { x: 0, y: 0 };
                  const x = ((position.x - graphBounds.minX) / graphBounds.width) * 100;
                  const y = ((position.y - graphBounds.minY) / graphBounds.height) * 100;
                  return (
                    <span
                      key={`minimap-${node.id}`}
                      className={`${styles.minimapNode} ${node.id === selectedScenarioId ? styles.minimapNodeActive : ""}`}
                      style={{ left: `${x}%`, top: `${y}%` }}
                    />
                  );
                })}
              </div>
            </aside>
          </div>
        </section>

        <aside className={`${styles.panel} ${styles.inspectorPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <strong>Inspector contextual</strong>
              <p>So o que importa para o tipo de no selecionado.</p>
            </div>
          </div>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <strong>{selectedNode?.label || "Sem no selecionado"}</strong>
                <p>{selectedNode?.description || "Selecione um no para editar o fluxo."}</p>
              </div>
              <span className={`${styles.badge} ${styles.badgeMuted}`}>{getNodeKindLabel(selectedNode?.nodeKind)}</span>
            </div>

            {selectedNode?.nodeKind === "template" ? (
              <div className={styles.templateInspector}>
                {templateOptions.length > 0 ? (
                  templateOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`${styles.templateOption} ${option.selected ? styles.templateOptionActive : ""}`}
                      onClick={() => {
                        onSelectTemplateOption?.(option.id);
                        setPreviewTrail([startNode?.id || selectedScenarioId]);
                      }}
                    >
                      <div>
                        <strong>{option.title}</strong>
                        {option.subtitle ? <p>{option.subtitle}</p> : null}
                      </div>
                      <div className={styles.scenarioMeta}>
                        <span className={`${styles.badge} ${option.ready === false ? styles.badgeWarning : styles.badgeAccent}`}>
                          {option.ready === false ? "Revisar" : "Pronto"}
                        </span>
                        {option.selected ? <span className={styles.badge}>Ativo</span> : null}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className={styles.emptyState}>Nenhum template ativo para ser usado como primeiro no.</div>
                )}
              </div>
            ) : null}

            {isEditableNode(selectedNode) ? (
              <>
                <div className={styles.fieldBlock}>
                  <span>Nome interno</span>
                  <input className="field" value={selectedNode?.id || ""} disabled />
                </div>
                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <strong>Tipo de mensagem</strong>
                      <p>Escolha se esta etapa usa apenas texto ou ramificacoes por botoes.</p>
                    </div>
                  </div>
                  <div className={styles.toggleGrid}>
                    <button
                      type="button"
                      className={`${styles.toggleCard} ${messageType === "simple" ? styles.toggleCardActive : ""}`}
                      onClick={() => onMessageTypeChange("simple")}
                    >
                      <strong>Simples</strong>
                      <p>Resposta direta sem clique visual.</p>
                    </button>
                    <button
                      type="button"
                      disabled={!supportsButtons}
                      className={`${styles.toggleCard} ${messageType === "buttons" ? styles.toggleCardActive : ""}`}
                      onClick={() => onMessageTypeChange("buttons")}
                    >
                      <strong>Com botoes</strong>
                      <p>Navega por nos estaveis do fluxo.</p>
                    </button>
                  </div>
                </article>

                <div className={styles.fieldBlock}>
                  <span>Texto</span>
                  <textarea
                    className="field"
                    rows={7}
                    value={messageText}
                    onChange={(event) => onMessageTextChange(event.target.value)}
                  />
                </div>

                <div className={styles.fieldBlock}>
                  <span>Variaveis usadas</span>
                  <div className={styles.chipList}>
                    {variables.map((variable) => (
                      <button
                        key={variable.key}
                        type="button"
                        className={styles.chip}
                        onClick={() => onAppendVariable(variable.key)}
                      >
                        <strong>{`{{${variable.key}}}`}</strong>
                        <small>{variable.scopeLabel}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <strong>Botoes</strong>
                      <p>Label, id estavel, proximo no e acao complementar.</p>
                    </div>
                    {supportsButtons && messageType === "buttons" ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={onAddButton}>
                        Adicionar botao
                      </button>
                    ) : null}
                  </div>

                  {!supportsButtons || messageType === "simple" ? (
                    <div className={styles.emptyState}>Esse no esta em modo simples.</div>
                  ) : buttons.length ? (
                    <div className={styles.buttonList}>
                      {buttons.map((button, index) => {
                        const action = actionById[button.actionId];
                        return (
                          <div key={`${button.buttonId}-${index}`} className={styles.buttonRow}>
                            <div className={styles.buttonGrid}>
                              <label className={styles.fieldBlock}>
                                <span>Label</span>
                                <input
                                  className="field"
                                  value={button.title}
                                  onChange={(event) => onUpdateButton(index, "title", event.target.value)}
                                />
                              </label>
                              <label className={styles.fieldBlock}>
                                <span>ID</span>
                                <input
                                  className="field"
                                  value={button.buttonId}
                                  onChange={(event) => onUpdateButton(index, "buttonId", event.target.value)}
                                />
                              </label>
                              <label className={styles.fieldBlock}>
                                <span>ActionId</span>
                                <select
                                  className="field"
                                  value={button.actionId}
                                  onChange={(event) => onUpdateButton(index, "actionId", event.target.value)}
                                >
                                  {actionOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <div className={styles.buttonMeta}>
                              <strong>{button.nextNodeId || "Sem nextNodeId"}</strong>
                              <p>{button.nextLabel || "Defina um destino visual para esse clique."}</p>
                              {action ? <p>{`Acao complementar: ${action.title}`}</p> : null}
                            </div>
                            <div className={styles.buttonActions}>
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemoveButton(index)}>
                                Remover
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>Nenhum botao configurado neste no ainda.</div>
                  )}
                </article>
              </>
            ) : selectedNode ? (
              <div className={styles.readonlyInspector}>
                <div className={styles.fieldBlock}>
                  <span>ID tecnico</span>
                  <input className="field" value={selectedNode.id} disabled />
                </div>
                <div className={styles.fieldBlock}>
                  <span>Efeito esperado</span>
                  <textarea className="field" rows={4} value={selectedNode.effectLabel || selectedNode.description} disabled />
                </div>
                <div className={styles.scenarioMeta}>
                  {selectedNode.toneLabel ? <span className={styles.badge}>{selectedNode.toneLabel}</span> : null}
                  {selectedNode.badge ? <span className={`${styles.badge} ${styles.badgeMuted}`}>{selectedNode.badge}</span> : null}
                </div>
              </div>
            ) : null}
          </article>
        </aside>
      </div>
    );
  }

  function renderPreviewTab() {
    return (
      <div className={styles.previewLayout}>
        <section className={`${styles.panel} ${styles.previewStage}`}>
          <div className={styles.panelHeader}>
            <div>
              <strong>Preview da conversa</strong>
              <p>Simulacao navegavel dos ramos principais do fluxo, com baloes e botões reais.</p>
            </div>
            <div className={styles.canvasStatus}>
              <span className={`${styles.badge} ${styles.badgeAccent}`}>{previewNode?.label || "Inicio"}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPreviewTrail([startNode?.id || selectedScenarioId])}>
                Reiniciar preview
              </button>
            </div>
          </div>

          <div className={styles.phoneShell}>
            <div className={styles.phoneHeader}>
              <strong>{previewFooter || eyebrow}</strong>
              <span>online agora</span>
            </div>

            <div className={styles.phoneBody}>
              {previewTrail.map((nodeId, index) => {
                const node = nodeById.get(nodeId);
                if (!node) return null;
                const previousNodeId = index > 0 ? previewTrail[index - 1] : null;
                const previousNode = previousNodeId ? nodeById.get(previousNodeId) : null;
                const inboundButton =
                  previousNode?.buttons.find((button) => button.nextNodeId === node.id)?.title || null;

                return (
                  <div key={`preview-step-${node.id}-${index}`} className={styles.previewConversationStep}>
                    {inboundButton ? (
                      <div className={`${styles.messageBubble} ${styles.inboundBubble}`}>
                        <p>{inboundButton}</p>
                      </div>
                    ) : null}
                    <div className={`${styles.messageBubble} ${styles.outboundBubble}`}>
                      <p>{index === 0 && node.nodeKind === "template" ? templateStart?.body || node.messageText : node.messageText}</p>
                      {node.buttons.length > 0 ? (
                        <div className={styles.previewButtonList}>
                          {node.buttons.map((button) => (
                            <button
                              key={`preview-${node.id}-${button.buttonId}`}
                              type="button"
                              className={styles.previewButton}
                              onClick={() => handlePreviewAdvance(button)}
                            >
                              {button.title}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className={styles.previewSidebar}>
          <article className={`${styles.panel} ${styles.card}`}>
            <div className={styles.cardHeader}>
              <div>
                <strong>Fallback textual</strong>
                <p>Versao pronta para cenarios sem botoes.</p>
              </div>
              <span className={`${styles.badge} ${styles.badgeWarning}`}>Fallback</span>
            </div>
            <pre className={styles.previewFallback}>{previewFallbackText || previewText || "Mensagem vazia."}</pre>
            {previewNote ? <p className={styles.previewNote}>{previewNote}</p> : null}
          </article>

          <article className={`${styles.panel} ${styles.card}`}>
            <div className={styles.cardHeader}>
              <div>
                <strong>Variaveis do no atual</strong>
                <p>Substituicoes visuais aplicadas no ramo que esta em simulacao.</p>
              </div>
            </div>
            <div className={styles.chipList}>
              {extractVariableKeys(previewNode?.messageText || "").length > 0 ? (
                extractVariableKeys(previewNode?.messageText || "").map((key) => (
                  <span key={`preview-var-${key}`} className={styles.chipStatic}>
                    {`{{${key}}}`}
                  </span>
                ))
              ) : (
                <div className={styles.emptyState}>Sem variaveis detectadas neste bloco.</div>
              )}
            </div>
          </article>

          <article className={`${styles.panel} ${styles.card}`}>
            <div className={styles.cardHeader}>
              <div>
                <strong>Saidas do no atual</strong>
                <p>O preview agora navega por `nextNodeId`, e a acao fica complementar.</p>
              </div>
            </div>
            {previewNodeButtons.length > 0 ? (
              <div className={styles.actionList}>
                {previewNodeButtons.map((button) => {
                  const action = actionById[button.actionId];
                  return (
                    <div key={`preview-action-${previewNode?.id}-${button.buttonId}`} className={styles.actionItem}>
                      <div className={styles.actionItemHeader}>
                        <div>
                          <strong>{button.title || "Botao sem titulo"}</strong>
                          <p>{button.nextLabel || action?.description || "Selecione uma acao para esse clique."}</p>
                        </div>
                      </div>
                      <div className={styles.scenarioMeta}>
                        <span className={`${styles.badge} ${styles.badgeMuted}`}>{button.buttonId}</span>
                        {button.nextNodeId ? <span className={styles.badge}>{button.nextNodeId}</span> : null}
                        <span className={`${styles.badge} ${styles.badgeAccent}`}>{action?.title || button.actionId}</span>
                        {action?.routeLabel ? <span className={styles.badge}>{action.routeLabel}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>Este bloco nao possui ramificacoes visuais.</div>
            )}
          </article>
        </aside>
      </div>
    );
  }

  function renderVariablesTab() {
    const groupOrder = ["Empresa", "Cliente", "Recovery", "Atendimento", "Sistema", "Capturadas no fluxo"];
    const grouped = catalogVariables.reduce((map, variable) => {
      const group = variable.categoryLabel || variable.scopeLabel || "Sistema";
      const current = map.get(group) || [];
      current.push(variable);
      map.set(group, current);
      return map;
    }, new Map<string, BotStudioVariable[]>());
    return (
      <div className={styles.catalogLayout}>
        <section className={styles.catalogSummary}>
          <article className={`${styles.panel} ${styles.metricCard}`}>
            <strong>{catalogVariables.length}</strong>
            <span>variaveis no catalogo</span>
          </article>
          <article className={`${styles.panel} ${styles.metricCard}`}>
            <strong>{catalogVariables.filter((item) => item.required).length}</strong>
            <span>obrigatorias</span>
          </article>
          <article className={`${styles.panel} ${styles.metricCard}`}>
            <strong>{variables.length}</strong>
            <span>disponiveis neste bloco</span>
          </article>
        </section>

        {groupOrder.map((groupLabel) => {
          const items = grouped.get(groupLabel) || [];
          return (
          <section key={groupLabel} className={styles.variableGroup}>
            <div className={styles.panelHeader}>
              <div>
                <strong>{groupLabel}</strong>
                <p>{items.length > 0 ? `${items.length} variaveis agrupadas por contexto de origem.` : "Nenhuma variavel exposta nesta categoria por enquanto."}</p>
              </div>
            </div>
            {items.length > 0 ? (
            <div className={styles.catalogGrid}>
              {items.map((variable) => {
                const usedIn = (variableUsage[variable.key] as string[] | undefined) || [];
                return (
                  <article key={variable.key} className={`${styles.panel} ${styles.catalogCard}`}>
                    <div className={styles.cardHeader}>
                      <div>
                        <strong>{variable.label}</strong>
                        <p>{`{{${variable.key}}}`}</p>
                      </div>
                      <div className={styles.scenarioMeta}>
                        <span className={`${styles.badge} ${styles.badgeMuted}`}>{variable.scopeLabel}</span>
                        {variable.required ? <span className={`${styles.badge} ${styles.badgeAccent}`}>Obrigatoria</span> : null}
                        {activeQuickInsertKeys.has(variable.key) ? <span className={styles.badge}>Disponivel agora</span> : null}
                      </div>
                    </div>
                    <div className={styles.catalogMeta}>
                      <span className={styles.metaLabel}>Origem</span>
                      <p>{variable.originLabel || variable.scopeLabel}</p>
                    </div>
                    <div className={styles.catalogMeta}>
                      <span className={styles.metaLabel}>Exemplo</span>
                      <p>{variable.example || "Sem exemplo cadastrado."}</p>
                    </div>
                    <div className={styles.catalogMeta}>
                      <span className={styles.metaLabel}>Usada em</span>
                      <div className={styles.scenarioMeta}>
                        {usedIn.length > 0 ? (
                          usedIn.map((usage) => (
                            <span key={`${variable.key}-${usage}`} className={`${styles.badge} ${styles.badgeMuted}`}>
                              {usage}
                            </span>
                          ))
                        ) : (
                          <span className={styles.badge}>Ainda nao usada</span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            ) : (
              <div className={styles.emptyState}>O fluxo atual ainda nao expoe variaveis desta categoria.</div>
            )}
          </section>
        );})}

        {variablesTabExtra ? <div className={styles.extraPanel}>{variablesTabExtra}</div> : null}
      </div>
    );
  }

  function renderActionsTab() {
    return (
      <div className={styles.catalogLayout}>
        <section className={styles.catalogSummary}>
          <article className={`${styles.panel} ${styles.metricCard}`}>
            <strong>{catalogActions.length}</strong>
            <span>acoes registradas</span>
          </article>
          <article className={`${styles.panel} ${styles.metricCard}`}>
            <strong>{catalogActions.filter((item) => item.enabled !== false).length}</strong>
            <span>acoes ativas</span>
          </article>
          <article className={`${styles.panel} ${styles.metricCard}`}>
            <strong>{buttons.length}</strong>
            <span>cliques no bloco atual</span>
          </article>
        </section>

        <section className={styles.catalogGrid}>
          {catalogActions.map((action) => {
            const usedIn = actionUsage.get(action.actionId) || [];
            return (
              <article key={action.actionId} className={`${styles.panel} ${styles.catalogCard}`}>
                <div className={styles.cardHeader}>
                  <div>
                    <strong>{action.title}</strong>
                    <p>{action.description}</p>
                  </div>
                  <div className={styles.scenarioMeta}>
                    {action.typeLabel ? <span className={`${styles.badge} ${styles.badgeAccent}`}>{action.typeLabel}</span> : null}
                    {action.routeLabel ? <span className={`${styles.badge} ${styles.badgeMuted}`}>{action.routeLabel}</span> : null}
                    <span className={`${styles.badge} ${action.enabled === false ? styles.badgeWarning : styles.badgeAccent}`}>
                      {action.enabled === false ? "Legada" : "Ativa"}
                    </span>
                  </div>
                </div>
                <div className={styles.catalogMeta}>
                  <span className={styles.metaLabel}>ID tecnico</span>
                  <p>{action.actionId}</p>
                </div>
                <div className={styles.catalogMeta}>
                  <span className={styles.metaLabel}>Usada por</span>
                  <div className={styles.scenarioMeta}>
                    {usedIn.length > 0 ? (
                      usedIn.map((usage) => (
                        <span
                          key={`${action.actionId}-${usage.scenarioLabel}-${usage.buttonLabel}`}
                          className={`${styles.badge} ${styles.badgeMuted}`}
                        >
                          {`${usage.scenarioLabel}: ${usage.buttonLabel}`}
                        </span>
                      ))
                    ) : (
                      <span className={styles.badge}>Sem botoes vinculados</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {actionsTabExtra ? <div className={styles.extraPanel}>{actionsTabExtra}</div> : null}
      </div>
    );
  }

  function renderPublicationTab() {
    return (
      <div className={styles.publicationLayout}>
        <section className={`${styles.panel} ${styles.publicationHero}`}>
          <div className={styles.cardHeader}>
            <div>
              <strong>{publicationTitle}</strong>
              <p>{publicationDescription}</p>
            </div>
            <span className={`${styles.statusBadge} ${publicationReady ? styles.statusReady : styles.statusDraft}`}>
              {computedPublicationStatus}
            </span>
          </div>

          <div className={styles.publicationActions}>
            <div className={styles.scenarioMeta}>
              <span className={`${styles.badge} ${styles.badgeMuted}`}>{flowScenarios.length} blocos mapeados</span>
              <span className={`${styles.badge} ${styles.badgeMuted}`}>{catalogActions.length} acoes catalogadas</span>
              <span className={`${styles.badge} ${styles.badgeMuted}`}>{catalogVariables.length} variaveis prontas</span>
            </div>
            {onPrimaryAction ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onPrimaryAction}
                disabled={primaryActionDisabled}
              >
                {primaryActionLabel}
              </button>
            ) : null}
          </div>
        </section>

        {publicationChecks.length > 0 ? (
          <section className={styles.checkGrid}>
            {publicationChecks.map((check) => (
              <article key={check.id} className={`${styles.panel} ${styles.checkCard}`}>
                <div className={styles.cardHeader}>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.description}</p>
                  </div>
                  <span className={`${styles.statusDot} ${check.ok ? styles.statusDotReady : styles.statusDotDraft}`} />
                </div>
                <span className={`${styles.badge} ${check.ok ? styles.badgeAccent : styles.badgeWarning}`}>
                  {check.ok ? "Validado" : "Revisar"}
                </span>
              </article>
            ))}
          </section>
        ) : null}

        {publicationTabExtra ? <div className={styles.extraPanel}>{publicationTabExtra}</div> : null}
      </div>
    );
  }

  return (
    <section className={styles.studio}>
      <header className={`${styles.panel} ${styles.hero}`}>
        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.description}>{description}</p>
        </div>
        <div className={styles.heroMeta}>
          <span className={`${styles.badge} ${styles.badgeAccent}`}>{flowScenarios.length} blocos visuais</span>
          <span className={`${styles.badge} ${styles.badgeMuted}`}>{catalogVariables.length} variaveis</span>
          <span className={`${styles.badge} ${styles.badgeMuted}`}>{catalogActions.length} acoes</span>
        </div>
      </header>

      <div className={styles.tabRow} role="tablist" aria-label={`${eyebrow} builder`}>
        {tabItems.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            className={`${styles.tabButton} ${tab.id === activeTab ? styles.tabButtonActive : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <strong>{tab.label}</strong>
            <span>{tab.helper}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.emptyState}>Carregando editor...</div>
      ) : activeTab === "flow" ? (
        renderFlowTab()
      ) : activeTab === "preview" ? (
        renderPreviewTab()
      ) : activeTab === "variables" ? (
        renderVariablesTab()
      ) : activeTab === "actions" ? (
        renderActionsTab()
      ) : (
        renderPublicationTab()
      )}
    </section>
  );
}
