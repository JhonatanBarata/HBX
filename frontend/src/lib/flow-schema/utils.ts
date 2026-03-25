import type {
  ActionNodeData,
  ButtonsNodeData,
  ConditionNodeData,
  DelayNodeData,
  EndNodeData,
  FlowActionDefinition,
  FlowBuilderEdge,
  FlowBuilderNode,
  FlowCategory,
  FlowChoiceOption,
  FlowDefinition,
  FlowLayoutSettings,
  FlowModuleKey,
  FlowNodeData,
  FlowNodeType,
  FlowPosition,
  FlowRuntimeSettings,
  FlowTemplateDefinition,
  FlowTransitionSummary,
  FlowVariableDefinition,
  HumanHandoffNodeData,
  ListNodeData,
  MessageNodeData,
  QuestionNodeData,
  StartNodeData,
  TemplateNodeData,
} from "./types";

type NodeDataByType<TType extends FlowNodeType> = Extract<FlowNodeData, { type: TType }>;

function getTypedNodeData<TType extends FlowNodeType>(
  node: FlowBuilderNode,
  type: TType,
): NodeDataByType<TType> | null {
  if (node.type !== type) return null;
  return node.data as NodeDataByType<TType>;
}

export type FlowLibraryItem = {
  type: FlowNodeType;
  title: string;
  category: FlowCategory;
  description: string;
  icon: string;
};

const DEFAULT_LAYOUT: FlowLayoutSettings = {
  mode: "edit",
  rowGap: 190,
  columnGap: 340,
  snapToGrid: true,
};

const DEFAULT_RUNTIME: FlowRuntimeSettings = {
  within24hWindow: true,
  showValidationHints: true,
};

export const FLOW_LIBRARY: FlowLibraryItem[] = [
  { type: "start", title: "Start", category: "entry", description: "Ponto inicial do fluxo.", icon: "start" },
  { type: "message", title: "Mensagem", category: "messaging", description: "Envia uma mensagem simples.", icon: "message" },
  { type: "question", title: "Pergunta", category: "interactive", description: "Coleta uma resposta do cliente.", icon: "question" },
  { type: "buttons", title: "Botões", category: "interactive", description: "Mensagem com até 3 respostas rápidas.", icon: "buttons" },
  { type: "list", title: "Lista", category: "interactive", description: "Lista com até 10 opções selecionáveis.", icon: "list" },
  { type: "condition", title: "Condição", category: "logic", description: "Decide o próximo passo por regra.", icon: "condition" },
  { type: "action", title: "Ação", category: "operations", description: "Dispara um efeito operacional.", icon: "action" },
  { type: "delay", title: "Delay", category: "operations", description: "Espera antes de continuar.", icon: "delay" },
  { type: "human_handoff", title: "Humano", category: "operations", description: "Pausa o bot e transfere para humano.", icon: "human" },
  { type: "template", title: "Template", category: "messaging", description: "Template oficial para fora da janela de 24h.", icon: "template" },
  { type: "end", title: "End", category: "terminal", description: "Finaliza o fluxo.", icon: "end" },
];

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeChoiceOption(label: string, index: number): FlowChoiceOption {
  return {
    id: `option_${index + 1}`,
    label,
    value: label.toLowerCase().replace(/\s+/g, "_"),
  };
}

function createNodeData(type: FlowNodeType, bindingKey?: string | null): FlowNodeData {
  switch (type) {
    case "start":
      return {
        type,
        title: "Início do fluxo",
        summary: "Ponto inicial destacado do bot.",
        category: "entry",
        bindingKey,
        channelPolicy: "either",
        config: { triggerLabel: "Nova conversa" },
      } satisfies StartNodeData;
    case "message":
      return {
        type,
        title: "Mensagem",
        summary: "Mensagem de texto simples.",
        category: "messaging",
        bindingKey,
        channelPolicy: "session",
        config: { body: "Digite a mensagem do bot aqui.", footer: "" },
      } satisfies MessageNodeData;
    case "question":
      return {
        type,
        title: "Pergunta",
        summary: "Coleta uma resposta do cliente.",
        category: "interactive",
        bindingKey,
        channelPolicy: "session",
        config: {
          prompt: "Qual informação você quer coletar?",
          variableKey: "resposta_cliente",
          placeholder: "Digite sua resposta...",
          answerType: "text",
        },
      } satisfies QuestionNodeData;
    case "buttons":
      return {
        type,
        title: "Mensagem com botões",
        summary: "Até 3 respostas rápidas do WhatsApp.",
        category: "interactive",
        bindingKey,
        channelPolicy: "session",
        config: {
          body: "Escolha uma opção abaixo:",
          footer: "",
          buttons: [makeChoiceOption("Opção 1", 0), makeChoiceOption("Opção 2", 1)],
        },
      } satisfies ButtonsNodeData;
    case "list":
      return {
        type,
        title: "Lista interativa",
        summary: "Lista com até 10 opções selecionáveis.",
        category: "interactive",
        bindingKey,
        channelPolicy: "session",
        config: {
          body: "Selecione um item da lista.",
          buttonLabel: "Ver opções",
          options: [makeChoiceOption("Item 1", 0), makeChoiceOption("Item 2", 1)],
        },
      } satisfies ListNodeData;
    case "condition":
      return {
        type,
        title: "Condição",
        summary: "Roteia por variável ou contexto.",
        category: "logic",
        bindingKey,
        channelPolicy: "either",
        config: {
          description: "Verifica se o cliente está dentro da regra.",
          cases: [
            { id: "case_true", label: "Verdadeiro", operator: "exists", variableKey: "cliente" },
            { id: "case_false", label: "Fallback", operator: "not_equals", variableKey: "cliente", value: "" },
          ],
          fallbackLabel: "Sem saída configurada",
        },
      } satisfies ConditionNodeData;
    case "action":
      return {
        type,
        title: "Ação",
        summary: "Executa uma ação operacional.",
        category: "operations",
        bindingKey,
        channelPolicy: "either",
        config: {
          actionId: "custom_action",
          payload: "{\"ok\":true}",
          note: "Configure a ação no painel direito.",
        },
      } satisfies ActionNodeData;
    case "delay":
      return {
        type,
        title: "Delay",
        summary: "Aguarda antes de seguir.",
        category: "operations",
        bindingKey,
        channelPolicy: "either",
        config: { amount: 15, unit: "minutes" },
      } satisfies DelayNodeData;
    case "human_handoff":
      return {
        type,
        title: "Transferência humana",
        summary: "Pausa o bot e envia para atendimento.",
        category: "operations",
        bindingKey,
        channelPolicy: "either",
        config: {
          message: "Vou transferir você para um atendente agora.",
          queue: "atendimento",
          reason: "Solicitação de suporte humano.",
        },
      } satisfies HumanHandoffNodeData;
    case "template":
      return {
        type,
        title: "Template WhatsApp",
        summary: "Mensagem oficial para fora da janela de 24h.",
        category: "messaging",
        bindingKey,
        channelPolicy: "template",
        config: {
          templateId: "",
          templateName: "template_notificacao",
          language: "pt_BR",
          body: "Template oficial do WhatsApp.",
        },
      } satisfies TemplateNodeData;
    case "end":
      return {
        type,
        title: "Fim",
        summary: "Encerra o fluxo com clareza.",
        category: "terminal",
        bindingKey,
        channelPolicy: "either",
        config: {
          closingMessage: "Conversa encerrada. Se precisar, estou por aqui.",
          result: "completed",
        },
      } satisfies EndNodeData;
    default:
      return createNodeData("message", bindingKey);
  }
}

export function createFlowNode<TType extends FlowNodeType>(
  type: TType,
  position: FlowPosition,
  bindingKey?: string | null,
): FlowBuilderNode<NodeDataByType<TType>> {
  return {
    id: makeId(type),
    type,
    position,
    data: createNodeData(type, bindingKey) as NodeDataByType<TType>,
  } as FlowBuilderNode<NodeDataByType<TType>>;
}

export function createFlowEdge(
  source: string,
  target: string,
  sourceHandle?: string | null,
  label?: string,
): FlowBuilderEdge {
  return {
    id: makeId("edge"),
    source,
    target,
    sourceHandle,
    label,
  };
}

export function createEmptyFlowDefinition(input: {
  name: string;
  description: string;
  moduleKey: FlowModuleKey;
  variables?: FlowVariableDefinition[];
  actions?: FlowActionDefinition[];
  templates?: FlowTemplateDefinition[];
}): FlowDefinition {
  const startNode = createFlowNode("start", { x: 40, y: 120 }, "start");
  const endNode = createFlowNode("end", { x: 430, y: 120 }, "end");
  return {
    version: 1,
    moduleKey: input.moduleKey,
    name: input.name,
    description: input.description,
    variables: input.variables || [],
    actions: input.actions || [],
    templates: input.templates || [],
    nodes: [startNode, endNode],
    edges: [createFlowEdge(startNode.id, endNode.id, null, "seguir")],
    layout: { ...DEFAULT_LAYOUT },
    runtime: { ...DEFAULT_RUNTIME },
  };
}

export function cloneFlowDefinition(definition: FlowDefinition): FlowDefinition {
  return JSON.parse(JSON.stringify(definition)) as FlowDefinition;
}

export function getNodeById(definition: FlowDefinition, nodeId: string | null | undefined) {
  if (!nodeId) return null;
  return definition.nodes.find((node) => node.id === nodeId) || null;
}

export function getOutgoingEdges(definition: FlowDefinition, nodeId: string) {
  return definition.edges.filter((edge) => edge.source === nodeId);
}

export function getIncomingEdges(definition: FlowDefinition, nodeId: string) {
  return definition.edges.filter((edge) => edge.target === nodeId);
}

export function getChoiceOptions(node: FlowBuilderNode) {
  const buttonsData = getTypedNodeData(node, "buttons");
  if (buttonsData) return buttonsData.config.buttons;
  const listData = getTypedNodeData(node, "list");
  if (listData) return listData.config.options;
  const conditionData = getTypedNodeData(node, "condition");
  if (conditionData) {
    return conditionData.config.cases.map((item) => ({ id: item.id, label: item.label }));
  }
  return [];
}

export function getNodeSummary(node: FlowBuilderNode) {
  const buttonsData = getTypedNodeData(node, "buttons");
  if (buttonsData) return `${buttonsData.config.buttons.length} respostas rápidas`;
  const listData = getTypedNodeData(node, "list");
  if (listData) return `${listData.config.options.length} opções interativas`;
  const conditionData = getTypedNodeData(node, "condition");
  if (conditionData) return `${conditionData.config.cases.length} casos`;
  const delayData = getTypedNodeData(node, "delay");
  if (delayData) return `${delayData.config.amount} ${delayData.config.unit}`;
  const questionData = getTypedNodeData(node, "question");
  if (questionData) return `Salva em {{${questionData.config.variableKey}}}`;
  const actionData = getTypedNodeData(node, "action");
  if (actionData) return actionData.config.actionId || "Ação operacional";
  const templateData = getTypedNodeData(node, "template");
  if (templateData) return templateData.config.templateName || "Template oficial";
  const endData = getTypedNodeData(node, "end");
  if (endData) return endData.config.result;
  const handoffData = getTypedNodeData(node, "human_handoff");
  if (handoffData) return handoffData.config.queue;
  const messageData = getTypedNodeData(node, "message");
  if (messageData) return messageData.config.body;
  return node.data.summary;
}

export function isTerminalNode(nodeType: FlowNodeType) {
  return nodeType === "end" || nodeType === "human_handoff";
}

export function getMaxOutgoing(nodeType: FlowNodeType) {
  if (nodeType === "end" || nodeType === "human_handoff") return 0;
  if (nodeType === "buttons" || nodeType === "list" || nodeType === "condition") return 20;
  return 1;
}

export function findStartNode(definition: FlowDefinition) {
  return definition.nodes.find((node) => node.type === "start") || null;
}

export function buildTransitionMap(definition: FlowDefinition): FlowTransitionSummary[] {
  return definition.nodes.map((node) => ({
    nodeId: node.id,
    title: node.data.title,
    branches: getOutgoingEdges(definition, node.id).map((edge) => ({
      edgeId: edge.id,
      label: edge.label || edge.sourceHandle || "seguir",
      targetId: edge.target,
    })),
  }));
}

export function autoLayoutFlow(definition: FlowDefinition) {
  const startNode = findStartNode(definition);
  if (!startNode) return definition;

  const queue = [{ nodeId: startNode.id, depth: 0 }];
  const visited = new Set<string>();
  const grouped = new Map<number, string[]>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);
    grouped.set(current.depth, [...(grouped.get(current.depth) || []), current.nodeId]);
    for (const edge of getOutgoingEdges(definition, current.nodeId)) {
      queue.push({ nodeId: edge.target, depth: current.depth + 1 });
    }
  }

  let fallbackDepth = grouped.size;
  for (const node of definition.nodes) {
    if (visited.has(node.id)) continue;
    grouped.set(fallbackDepth, [...(grouped.get(fallbackDepth) || []), node.id]);
    fallbackDepth += 1;
  }

  return {
    ...definition,
    nodes: definition.nodes.map((node) => {
      for (const [depth, row] of grouped.entries()) {
        const index = row.indexOf(node.id);
        if (index === -1) continue;
        return {
          ...node,
          position: {
            x: 80 + depth * definition.layout.columnGap,
            y: 80 + index * definition.layout.rowGap,
          },
        };
      }
      return node;
    }),
  };
}

export function ensureFlowDefinition(input: unknown, fallback: FlowDefinition) {
  if (!input || typeof input !== "object") return cloneFlowDefinition(fallback);
  try {
    const parsed = input as FlowDefinition;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return cloneFlowDefinition(fallback);
    }
    return {
      ...cloneFlowDefinition(fallback),
      ...parsed,
      nodes: parsed.nodes,
      edges: parsed.edges,
      layout: { ...DEFAULT_LAYOUT, ...(parsed.layout || {}) },
      runtime: { ...DEFAULT_RUNTIME, ...(parsed.runtime || {}) },
    };
  } catch {
    return cloneFlowDefinition(fallback);
  }
}
