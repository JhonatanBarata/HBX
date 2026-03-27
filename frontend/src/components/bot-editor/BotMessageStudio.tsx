"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  nodeKind?: "template" | "message" | "action" | "decision" | "human_handoff" | "end";
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

type ButtonTargetOption = {
  value: string;
  label: string;
  description?: string;
};

type BotMessageStudioProps = {
  eyebrow: string;
  title: string;
  description: string;
  flowScenarios: BotStudioFlowScenario[];
  flowEdges?: BotStudioFlowEdge[];
  flowOrientation?: "horizontal" | "vertical";
  flowLayoutMode?: "standard" | "canvas-focus";
  canvasViewportMaxHeight?: number;
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
  buttonTargetOptions?: ButtonTargetOption[];
  onUpdateButtonTarget?: (index: number, nextNodeId: string) => void;
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
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  variablesTabExtra?: ReactNode;
  actionsTabExtra?: ReactNode;
  publicationTabExtra?: ReactNode;
  loading?: boolean;
};

type StudioTab = "flow" | "variables" | "actions" | "publication";
type InspectorSectionId = "content" | "variables" | "buttons" | "capture" | "advanced";

const FLOW_NODE_WIDTH = 248;
const FLOW_NODE_HEIGHT = 110;
const FLOW_CANVAS_PADDING_X = 28;
const FLOW_CANVAS_PADDING_Y = 28;

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
    case "decision":
      return "Decisao";
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
  return Boolean(
    node &&
      node.editable !== false &&
      node.nodeKind !== "template" &&
      node.nodeKind !== "action",
  );
}

function getDefaultInspectorSections(node: BotStudioFlowScenario | null): InspectorSectionId[] {
  if (!node) return ["content"];
  if (node.nodeKind === "template") return ["content", "advanced"];
  if (node.nodeKind === "action") return ["capture", "advanced"];
  if (node.nodeKind === "decision") return node.supportsButtons === false ? ["content", "advanced"] : ["content", "buttons"];
  if (isEditableNode(node) && node.supportsButtons !== false) return ["content", "buttons"];
  return ["content", "advanced"];
}

export default function BotMessageStudio(props: BotMessageStudioProps) {
  const {
    eyebrow,
    title,
    description,
    flowScenarios,
    flowEdges = [],
    flowOrientation = "horizontal",
    flowLayoutMode = "standard",
    canvasViewportMaxHeight = 640,
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
    buttonTargetOptions = [],
    onUpdateButtonTarget,
    onAddButton,
    onRemoveButton,
    variables,
    catalogVariables,
    onAppendVariable,
    previewFooter,
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
    secondaryActionLabel,
    onSecondaryAction,
    variablesTabExtra,
    actionsTabExtra,
    publicationTabExtra,
    loading = false,
  } = props;

  const [activeTab, setActiveTab] = useState<StudioTab>("flow");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [previewTrail, setPreviewTrail] = useState<string[]>([startNodeId || selectedScenarioId]);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [inspectorState, setInspectorState] = useState<{
    nodeId: string | null;
    sections: InspectorSectionId[];
  }>({
    nodeId: selectedScenarioId || null,
    sections: ["content", "buttons"],
  });
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
  const relatedNodeIds = useMemo(() => {
    const related = new Set<string>();
    if (selectedScenarioId) related.add(selectedScenarioId);
    for (const edge of flowEdges) {
      if (edge.from === selectedScenarioId || edge.to === selectedScenarioId) {
        related.add(edge.from);
        related.add(edge.to);
      }
    }
    return related;
  }, [flowEdges, selectedScenarioId]);
  const selectedEdgeIds = useMemo(
    () => new Set(flowEdges.filter((edge) => edge.from === selectedScenarioId || edge.to === selectedScenarioId).map((edge) => edge.id)),
    [flowEdges, selectedScenarioId],
  );

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
    const minX = Math.min(...xs, 0) - FLOW_CANVAS_PADDING_X;
    const minY = Math.min(...ys, 0) - FLOW_CANVAS_PADDING_Y;
    const maxX = Math.max(...xs.map((x) => x + FLOW_NODE_WIDTH), FLOW_NODE_WIDTH) + FLOW_CANVAS_PADDING_X;
    const maxY = Math.max(...ys.map((y) => y + FLOW_NODE_HEIGHT), FLOW_NODE_HEIGHT) + FLOW_CANVAS_PADDING_Y;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [flowScenarios]);

  const canvasViewportHeight = useMemo(
    () => Math.max(360, Math.min(graphBounds.height + 12, canvasViewportMaxHeight)),
    [canvasViewportMaxHeight, graphBounds.height],
  );

  const previewPaths = useMemo(() => {
    const rootId = startNode?.id || selectedScenarioId || flowScenarios[0]?.id;
    const paths = new Map<string, string[]>();
    if (!rootId || !nodeById.has(rootId)) return paths;

    const queue = [rootId];
    paths.set(rootId, [rootId]);

    while (queue.length > 0) {
      const currentId = queue.shift() as string;
      const currentPath = paths.get(currentId) || [currentId];
      const currentNode = nodeById.get(currentId);

      for (const button of currentNode?.buttons || []) {
        if (!button.nextNodeId || paths.has(button.nextNodeId) || !nodeById.has(button.nextNodeId)) {
          continue;
        }
        paths.set(button.nextNodeId, [...currentPath, button.nextNodeId]);
        queue.push(button.nextNodeId);
      }
    }

    return paths;
  }, [flowScenarios, nodeById, selectedScenarioId, startNode?.id]);

  const previewNodeId = previewTrail[previewTrail.length - 1] || startNode?.id || selectedScenarioId;
  const previewNode = nodeById.get(previewNodeId) || startNode || null;

  const activeQuickInsertKeys = useMemo(() => new Set(variables.map((item) => item.key)), [variables]);
  const buttonTargetById = useMemo(
    () => new Map(buttonTargetOptions.map((item) => [item.value, item])),
    [buttonTargetOptions],
  );
  const publicationReady = publicationChecks.length > 0 && publicationChecks.every((item) => item.ok);
  const computedPublicationStatus =
    publicationStatusLabel || (publicationReady ? "Fluxo pronto para salvar" : "Rascunho com pontos para revisar");
  const activeInspectorSections =
    inspectorState.nodeId === (selectedNode?.id || null)
      ? inspectorState.sections
      : getDefaultInspectorSections(selectedNode);

  useEffect(() => {
    if (!previewModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [previewModalOpen]);

  const tabItems: Array<{ id: StudioTab; label: string; helper: string }> = [
    { id: "flow", label: "Fluxo", helper: `${flowScenarios.length} blocos` },
    { id: "variables", label: "Variaveis", helper: `${catalogVariables.length} itens` },
    { id: "actions", label: "Acoes", helper: `${catalogActions.length} rotas` },
    { id: "publication", label: "Publicacao", helper: publicationReady ? "Pronto" : "Rascunho" },
  ];

  function getPreviewPath(nodeId: string) {
    return previewPaths.get(nodeId) || [nodeId];
  }

  function getPreviewMessage(node: BotStudioFlowScenario | null, index: number) {
    if (!node) return "";
    if (index === 0 && node.nodeKind === "template") {
      return templateStart?.body || node.messageText || node.effectLabel || node.description;
    }
    return node.messageText || node.effectLabel || node.description || "Sem mensagem configurada.";
  }

  function handleSelectNode(nodeId: string, options?: { openPreview?: boolean }) {
    onSelectScenario(nodeId);
    setPreviewTrail(getPreviewPath(nodeId));
    if (options?.openPreview) {
      setPreviewModalOpen(true);
    }
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
    onSelectScenario(button.nextNodeId);
    setPreviewTrail((current) => [...current, button.nextNodeId as string]);
  }

  function openPreviewFromCurrentSelection() {
    setPreviewTrail(getPreviewPath(selectedScenarioId));
    setPreviewModalOpen(true);
  }

  function toggleInspectorSection(sectionId: InspectorSectionId) {
    const nodeId = selectedNode?.id || null;
    setInspectorState((current) => {
      const baselineSections =
        current.nodeId === nodeId ? current.sections : getDefaultInspectorSections(selectedNode);
      if (baselineSections.includes(sectionId)) {
        return {
          nodeId,
          sections: baselineSections.filter((item) => item !== sectionId),
        };
      }
      return {
        nodeId,
        sections: [...baselineSections.slice(-1), sectionId],
      };
    });
  }

  function renderInspectorSection(
    sectionId: InspectorSectionId,
    title: string,
    content: ReactNode,
    options?: { meta?: ReactNode; disabled?: boolean },
  ) {
    const open = activeInspectorSections.includes(sectionId) && !options?.disabled;

    return (
      <section
        className={`${styles.inspectorSection} ${open ? styles.inspectorSectionOpen : ""} ${
          options?.disabled ? styles.inspectorSectionDisabled : ""
        }`}
      >
        <button
          type="button"
          className={styles.inspectorSectionTrigger}
          onClick={() => toggleInspectorSection(sectionId)}
          disabled={options?.disabled}
          aria-expanded={open}
        >
          <span>{title}</span>
          <div className={styles.inspectorSectionMeta}>
            {options?.meta ? <span className={styles.badge}>{options.meta}</span> : null}
            <span className={`${styles.badge} ${styles.badgeMuted}`}>{open ? "Aberto" : "Fechado"}</span>
          </div>
        </button>
        {open ? <div className={styles.inspectorSectionBody}>{content}</div> : null}
      </section>
    );
  }

  function renderConversationPreview() {
    return (
      <div className={styles.phoneShell}>
        <div className={styles.phoneHeader}>
          <div className={styles.phoneHeaderMain}>
            <span className={styles.phoneAvatar}>{(previewFooter || eyebrow).slice(0, 1)}</span>
            <div>
              <strong>{previewFooter || eyebrow}</strong>
              <span className={styles.phonePresence}>{previewNode?.label || "Fluxo"}</span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPreviewTrail(getPreviewPath(selectedScenarioId))}
          >
            Reiniciar
          </button>
        </div>

        <div className={styles.phoneBody}>
          {previewTrail.map((nodeId, index) => {
            const node = nodeById.get(nodeId);
            if (!node) return null;

            const previousNodeId = index > 0 ? previewTrail[index - 1] : null;
            const previousNode = previousNodeId ? nodeById.get(previousNodeId) : null;
            const triggerButton = previousNode?.buttons.find((button) => button.nextNodeId === node.id) || null;
            const triggerAction = triggerButton ? actionById[triggerButton.actionId] : null;
            const isLastStep = index === previewTrail.length - 1;

            return (
              <div key={`preview-step-${node.id}-${index}`} className={styles.previewConversationStep}>
                {triggerButton ? (
                  <div className={`${styles.messageBubble} ${styles.inboundBubble}`}>
                    <p>{triggerButton.title}</p>
                    <span className={styles.bubbleMeta}>Cliente</span>
                  </div>
                ) : null}

                {triggerAction ? (
                  <div className={styles.previewActionEvent}>
                    <span className={`${styles.badge} ${styles.badgeAccent}`}>{triggerAction.title}</span>
                    {triggerAction.typeLabel ? <span className={`${styles.badge} ${styles.badgeMuted}`}>{triggerAction.typeLabel}</span> : null}
                  </div>
                ) : null}

                <div className={`${styles.messageBubble} ${styles.outboundBubble}`}>
                  <p>{getPreviewMessage(node, index)}</p>
                  <span className={styles.bubbleMeta}>Agora</span>
                  {isLastStep && node.buttons.length > 0 ? (
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
    );
  }

  function renderFlowTab() {
    const templateFocus = flowLayoutMode === "canvas-focus" && selectedNode?.nodeKind === "template";

    return (
      <div
        className={`${styles.flowLayout} ${
          flowLayoutMode === "canvas-focus" ? styles.flowLayoutCanvasFocus : ""
        } ${templateFocus ? styles.flowLayoutCanvasFocusTemplate : ""}`}
      >
        <aside className={`${styles.panel} ${styles.libraryPanel} ${styles.flowLibraryRegion}`}>
          <div className={styles.panelHeader}>
            <div>
              <strong>Mapa do fluxo</strong>
              <p>Tronco principal, ramos e saidas compartilhadas.</p>
            </div>
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
              </button>
            ))}
          </div>
        </aside>

        <section className={`${styles.panel} ${styles.canvasPanel} ${styles.flowCanvasRegion}`}>
          <div className={styles.panelHeader}>
            <div>
              <strong>Canvas unificado</strong>
              <p>Leitura principal do fluxo com atendimento e financeiro na mesma arvore.</p>
            </div>
            <div className={styles.canvasStatus}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setZoom((current) => Math.max(0.72, Number((current - 0.12).toFixed(2))))}>-</button>
              <span className={`${styles.badge} ${styles.badgeAccent}`}>{Math.round(zoom * 100)}%</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setZoom((current) => Math.min(1.4, Number((current + 0.12).toFixed(2))))}>+</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setZoom(1); setPan({ x: 24, y: 24 }); }}>
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
            <div className={styles.canvasViewport} style={{ minHeight: canvasViewportHeight }}>
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
                    const startX = from.position.x + FLOW_NODE_WIDTH / 2 - graphBounds.minX;
                    const endX = to.position.x + FLOW_NODE_WIDTH / 2 - graphBounds.minX;
                    const startY =
                      flowOrientation === "vertical"
                        ? from.position.y + FLOW_NODE_HEIGHT - graphBounds.minY
                        : from.position.y + FLOW_NODE_HEIGHT * 0.68 - graphBounds.minY;
                    const endY =
                      flowOrientation === "vertical"
                        ? to.position.y - graphBounds.minY
                        : to.position.y + FLOW_NODE_HEIGHT * 0.16 - graphBounds.minY;
                    const midX = (startX + endX) / 2;
                    const midY = (startY + endY) / 2;
                    const path =
                      flowOrientation === "vertical"
                        ? `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`
                        : `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
                    const edgeActive = selectedEdgeIds.has(edge.id);
                    return (
                      <g key={edge.id}>
                        <path d={path} className={`${styles.flowEdgePath} ${edgeActive ? styles.flowEdgePathActive : styles.flowEdgePathMuted}`} />
                        {edge.label ? (
                          <text
                            x={flowOrientation === "vertical" ? midX + 8 : midX}
                            y={flowOrientation === "vertical" ? midY - 6 : (startY + endY) / 2 - 8}
                            className={`${styles.flowEdgeLabel} ${edgeActive ? styles.flowEdgeLabelActive : styles.flowEdgeLabelMuted}`}
                          >
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
                  const connected = relatedNodeIds.has(node.id);
                  const nodeKindClass =
                    node.nodeKind === "template"
                      ? styles.flowCanvasNodeTemplate
                      : node.nodeKind === "decision"
                        ? styles.flowCanvasNodeDecision
                        : node.nodeKind === "action"
                          ? styles.flowCanvasNodeAction
                          : node.nodeKind === "human_handoff"
                            ? styles.flowCanvasNodeHuman
                            : node.nodeKind === "end"
                              ? styles.flowCanvasNodeEnd
                              : "";
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={`${styles.flowCanvasNode} ${nodeKindClass} ${active ? styles.flowCanvasNodeActive : ""} ${!active && connected ? styles.flowCanvasNodeConnected : ""} ${!connected ? styles.flowCanvasNodeMuted : ""}`}
                      style={{ left: position.x - graphBounds.minX, top: position.y - graphBounds.minY }}
                      onClick={() => handleSelectNode(node.id, { openPreview: true })}
                    >
                      <span className={styles.flowNodeEyebrow}>{getNodeKindLabel(node.nodeKind)}</span>
                      <strong>{node.label}</strong>
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
          </div>
        </section>

        <aside className={`${styles.panel} ${styles.inspectorPanel} ${styles.flowInspectorRegion}`}>
          <div className={styles.inspectorHeader}>
            <div>
              <span className={styles.metaLabel}>Bloco selecionado</span>
              <strong>{selectedNode?.label || "Sem no selecionado"}</strong>
              <p>{selectedNode?.description || "Edite apenas o que impacta este ponto do fluxo."}</p>
            </div>
            <span className={`${styles.badge} ${styles.badgeMuted}`}>{getNodeKindLabel(selectedNode?.nodeKind)}</span>
          </div>
          <div className={styles.inspectorBody}>
            {selectedNode?.nodeKind === "template"
              ? renderInspectorSection(
                  "content",
                  "Conteudo",
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
                  </div>,
                  { meta: `${templateOptions.length} templates` },
                )
              : null}

            {isEditableNode(selectedNode)
              ? renderInspectorSection(
                  "content",
                  "Conteudo",
                  <>
                    <div className={styles.toggleGrid}>
                      <button
                        type="button"
                        className={`${styles.toggleCard} ${messageType === "simple" ? styles.toggleCardActive : ""}`}
                        onClick={() => onMessageTypeChange("simple")}
                      >
                        <strong>Simples</strong>
                        <p>Texto direto.</p>
                      </button>
                      <button
                        type="button"
                        disabled={!supportsButtons}
                        className={`${styles.toggleCard} ${messageType === "buttons" ? styles.toggleCardActive : ""}`}
                        onClick={() => onMessageTypeChange("buttons")}
                      >
                        <strong>Com botoes</strong>
                        <p>Ramifica o fluxo.</p>
                      </button>
                    </div>

                    <label className={styles.fieldBlock}>
                      <span>Mensagem</span>
                      <textarea
                        className={`field ${styles.messageEditor}`}
                        rows={8}
                        value={messageText}
                        onChange={(event) => onMessageTextChange(event.target.value)}
                      />
                    </label>
                  </>,
                )
              : null}

            {isEditableNode(selectedNode)
              ? renderInspectorSection(
                  "variables",
                  "Variaveis",
                  variables.length > 0 ? (
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
                  ) : (
                    <div className={styles.emptyState}>Nenhuma variavel disponivel para este bloco.</div>
                  ),
                  { meta: `${variables.length} itens` },
                )
              : null}

            {isEditableNode(selectedNode)
              ? renderInspectorSection(
                  "buttons",
                  "Botoes",
                  !supportsButtons || messageType === "simple" ? (
                    <div className={styles.emptyState}>Esse bloco esta em modo simples.</div>
                  ) : (
                    <>
                      <div className={styles.inspectorActionRow}>
                        <span className={styles.metaLabel}>Saidas do bloco</span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={onAddButton}>
                          Adicionar
                        </button>
                      </div>
                      {buttons.length > 0 ? (
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
                                    <span>Acao</span>
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
                                  {buttonTargetOptions.length > 0 ? (
                                    <label className={styles.fieldBlock}>
                                      <span>Destino</span>
                                      <select
                                        className="field"
                                        value={button.nextNodeId || ""}
                                        onChange={(event) => onUpdateButtonTarget?.(index, event.target.value)}
                                      >
                                        {buttonTargetOptions.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  ) : null}
                                </div>
                                <div className={styles.buttonMeta}>
                                  <strong>
                                    {buttonTargetById.get(String(button.nextNodeId || ""))?.label ||
                                      button.nextLabel ||
                                      "Destino indefinido"}
                                  </strong>
                                  <p>
                                    {buttonTargetById.get(String(button.nextNodeId || ""))?.description ||
                                      (button.nextNodeId
                                        ? `ID interno: ${button.nextNodeId}`
                                        : "Defina a acao para encaixar o proximo passo.")}
                                  </p>
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
                        <div className={styles.emptyState}>Nenhum botao configurado neste bloco.</div>
                      )}
                    </>
                  ),
                  { meta: `${buttons.length} saidas` },
                )
              : null}

            {!isEditableNode(selectedNode) && selectedNode?.nodeKind === "action"
              ? renderInspectorSection(
                  "capture",
                  "Captura",
                  <div className={styles.readonlyInspector}>
                    <div className={styles.fieldBlock}>
                      <span>Acao do fluxo</span>
                      <textarea className="field" rows={4} value={selectedNode.effectLabel || selectedNode.description} disabled />
                    </div>
                  </div>,
                )
              : null}

            {selectedNode
              ? renderInspectorSection(
                  "advanced",
                  "Avancado",
                  <div className={styles.readonlyInspector}>
                    <div className={styles.fieldBlock}>
                      <span>ID interno</span>
                      <input className="field" value={selectedNode.id} disabled />
                    </div>
                    {selectedNode.effectLabel || selectedNode.description ? (
                      <div className={styles.fieldBlock}>
                        <span>Leitura operacional</span>
                        <textarea
                          className="field"
                          rows={4}
                          value={selectedNode.effectLabel || selectedNode.description}
                          disabled
                        />
                      </div>
                    ) : null}
                    <div className={styles.scenarioMeta}>
                      {selectedNode.toneLabel ? <span className={styles.badge}>{selectedNode.toneLabel}</span> : null}
                      {selectedNode.badge ? <span className={`${styles.badge} ${styles.badgeMuted}`}>{selectedNode.badge}</span> : null}
                    </div>
                  </div>,
                )
              : null}
          </div>
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
      <header className={`${styles.panel} ${styles.topbar}`}>
        <div className={styles.topbarMain}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <div className={styles.topbarTitleRow}>
            <h3 className={styles.title}>{title}</h3>
            <span className={`${styles.statusBadge} ${publicationReady ? styles.statusReady : styles.statusDraft}`}>
              {computedPublicationStatus}
            </span>
          </div>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        <div className={styles.topbarActions}>
          {onSecondaryAction && secondaryActionLabel ? (
            <button type="button" className={styles.toolbarButton} onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </button>
          ) : null}
          <button type="button" className={styles.toolbarButton} onClick={openPreviewFromCurrentSelection}>
            Preview
          </button>
          {onPrimaryAction ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onPrimaryAction}
              disabled={primaryActionDisabled}
            >
              {primaryActionLabel}
            </button>
          ) : null}
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
      ) : activeTab === "variables" ? (
        renderVariablesTab()
      ) : activeTab === "actions" ? (
        renderActionsTab()
      ) : (
        renderPublicationTab()
      )}

      {previewModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.previewPopoverLayer} role="presentation">
              <div className={styles.previewPopover} role="dialog" aria-modal="true" aria-label="Preview do fluxo selecionado">
                <div className={styles.previewPopoverHeader}>
                  <div>
                    <p className={styles.eyebrow}>Visualizado</p>
                    <strong>{previewNode?.label || title}</strong>
                  </div>
                  <button
                    type="button"
                    className={styles.previewPopoverClose}
                    aria-label="Fechar preview"
                    onClick={() => setPreviewModalOpen(false)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                {renderConversationPreview()}
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
