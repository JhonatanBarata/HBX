import {
  findStartNode,
  getChoiceOptions,
  getNodeById,
  getOutgoingEdges,
} from "@/lib/flow-schema/utils";
import type {
  FlowBuilderEdge,
  FlowBuilderNode,
  FlowChoiceOption,
  FlowDefinition,
  FlowNodeData,
  FlowRuntimeEvent,
  FlowRuntimeSession,
} from "@/lib/flow-schema/types";

function makeEventId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

type NodeDataByType<TType extends FlowBuilderNode["type"]> = Extract<FlowNodeData, { type: TType }>;

function getTypedNodeData<TType extends FlowBuilderNode["type"]>(
  node: FlowBuilderNode,
  type: TType,
): NodeDataByType<TType> | null {
  if (node.type !== type) return null;
  return node.data as NodeDataByType<TType>;
}

function chooseEdge(
  definition: FlowDefinition,
  node: FlowBuilderNode,
  sourceHandle?: string | null,
) {
  const outgoing = getOutgoingEdges(definition, node.id);
  if (sourceHandle) {
    return outgoing.find((edge) => edge.sourceHandle === sourceHandle) || null;
  }
  return outgoing[0] || null;
}

function resolveConditionHandle(node: FlowBuilderNode, variables: Record<string, string>) {
  const conditionData = getTypedNodeData(node, "condition");
  if (!conditionData) return null;
  for (const item of conditionData.config.cases) {
    const currentValue = String(variables[item.variableKey] || "");
    if (item.operator === "exists" && currentValue) return item.id;
    if (item.operator === "equals" && currentValue === String(item.value || "")) return item.id;
    if (item.operator === "not_equals" && currentValue !== String(item.value || "")) return item.id;
    if (item.operator === "contains" && currentValue.includes(String(item.value || ""))) return item.id;
    if (item.operator === "greater_than" && Number(currentValue) > Number(item.value || 0)) return item.id;
    if (item.operator === "less_than" && Number(currentValue) < Number(item.value || 0)) return item.id;
  }
  return null;
}

function appendEvent(session: FlowRuntimeSession, event: FlowRuntimeEvent): FlowRuntimeSession {
  return {
    ...session,
    events: [...session.events, event],
  };
}

export function createRuntimeSession(
  definition: FlowDefinition,
  seedVariables?: Record<string, string>,
): FlowRuntimeSession {
  const startNode = findStartNode(definition);
  return {
    currentNodeId: startNode?.id || null,
    waitingForNodeId: null,
    completed: false,
    paused: false,
    events: [],
    variables: { ...(seedVariables || {}) },
    visitedNodeIds: [],
  };
}

function nextSessionWithEdge(
  definition: FlowDefinition,
  session: FlowRuntimeSession,
  edge: FlowBuilderEdge | null,
) {
  if (!edge) {
    return {
      ...session,
      currentNodeId: null,
      completed: true,
    };
  }
  return {
    ...session,
    currentNodeId: edge.target,
  };
}

export function advanceRuntimeSession(
  definition: FlowDefinition,
  current: FlowRuntimeSession,
  input?: { value: string; optionId?: string },
): FlowRuntimeSession {
  let session = { ...current };
  let safetyCounter = 0;

  if (session.waitingForNodeId && input) {
    const waitingNode = getNodeById(definition, session.waitingForNodeId);
    if (waitingNode) {
      session = appendEvent(session, {
        id: makeEventId("user"),
        kind: "user_message",
        nodeId: waitingNode.id,
        title: waitingNode.data.title,
        body: input.value,
      });

      if (waitingNode.type === "question") {
        const questionData = getTypedNodeData(waitingNode, "question");
        session.variables = {
          ...session.variables,
          ...(questionData ? { [questionData.config.variableKey]: input.value } : {}),
        };
      }

      session.waitingForNodeId = null;
      session.currentNodeId = waitingNode.id;

      const nextEdge =
        waitingNode.type === "buttons" || waitingNode.type === "list"
          ? chooseEdge(definition, waitingNode, input.optionId || null)
          : chooseEdge(definition, waitingNode);
      session = nextSessionWithEdge(definition, session, nextEdge);
    }
  }

  while (!session.completed && !session.paused && session.currentNodeId && safetyCounter < 80) {
    safetyCounter += 1;
    const node = getNodeById(definition, session.currentNodeId);
    if (!node) {
      return { ...session, completed: true, currentNodeId: null };
    }

    if (!session.visitedNodeIds.includes(node.id)) {
      session.visitedNodeIds = [...session.visitedNodeIds, node.id];
    }

    if (node.type === "start") {
      session = nextSessionWithEdge(definition, session, chooseEdge(definition, node));
      continue;
    }

    if (node.type === "message") {
      const messageData = getTypedNodeData(node, "message");
      if (!messageData) continue;
      session = appendEvent(session, {
        id: makeEventId("bot"),
        kind: "bot_message",
        nodeId: node.id,
        title: node.data.title,
        body: messageData.config.body,
        messageType: "message",
      });
      session = nextSessionWithEdge(definition, session, chooseEdge(definition, node));
      continue;
    }

    if (node.type === "template") {
      const templateData = getTypedNodeData(node, "template");
      if (!templateData) continue;
      session = appendEvent(session, {
        id: makeEventId("template"),
        kind: "bot_message",
        nodeId: node.id,
        title: node.data.title,
        body: templateData.config.body,
        messageType: "template",
      });
      session = nextSessionWithEdge(definition, session, chooseEdge(definition, node));
      continue;
    }

    if (node.type === "buttons" || node.type === "list") {
      const interactiveData =
        node.type === "buttons" ? getTypedNodeData(node, "buttons") : getTypedNodeData(node, "list");
      if (!interactiveData) continue;
      const options = getChoiceOptions(node) as FlowChoiceOption[];
      session = appendEvent(session, {
        id: makeEventId("bot"),
        kind: "bot_message",
        nodeId: node.id,
        title: node.data.title,
        body: interactiveData.config.body,
        messageType: node.type,
        options,
      });
      session.waitingForNodeId = node.id;
      break;
    }

    if (node.type === "question") {
      const questionData = getTypedNodeData(node, "question");
      if (!questionData) continue;
      session = appendEvent(session, {
        id: makeEventId("bot"),
        kind: "bot_message",
        nodeId: node.id,
        title: node.data.title,
        body: questionData.config.prompt,
        messageType: "question",
      });
      session.waitingForNodeId = node.id;
      break;
    }

    if (node.type === "condition") {
      const conditionData = getTypedNodeData(node, "condition");
      if (!conditionData) continue;
      const matchedHandle = resolveConditionHandle(node, session.variables);
      session = appendEvent(session, {
        id: makeEventId("system"),
        kind: "system_event",
        nodeId: node.id,
        title: node.data.title,
        body: matchedHandle
          ? `Condição satisfeita: ${matchedHandle}`
          : conditionData.config.fallbackLabel || "Condição sem correspondência.",
        tone: matchedHandle ? "success" : "warning",
      });
      session = nextSessionWithEdge(definition, session, chooseEdge(definition, node, matchedHandle));
      continue;
    }

    if (node.type === "action") {
      const actionData = getTypedNodeData(node, "action");
      if (!actionData) continue;
      session = appendEvent(session, {
        id: makeEventId("system"),
        kind: "system_event",
        nodeId: node.id,
        title: node.data.title,
        body: `Ação executada: ${actionData.config.actionId}`,
        tone: "neutral",
      });
      session = nextSessionWithEdge(definition, session, chooseEdge(definition, node));
      continue;
    }

    if (node.type === "delay") {
      const delayData = getTypedNodeData(node, "delay");
      if (!delayData) continue;
      session = appendEvent(session, {
        id: makeEventId("delay"),
        kind: "system_event",
        nodeId: node.id,
        title: node.data.title,
        body: `Delay de ${delayData.config.amount} ${delayData.config.unit}.`,
        tone: "neutral",
      });
      session = nextSessionWithEdge(definition, session, chooseEdge(definition, node));
      continue;
    }

    if (node.type === "human_handoff") {
      const handoffData = getTypedNodeData(node, "human_handoff");
      if (!handoffData) continue;
      session = appendEvent(session, {
        id: makeEventId("handoff"),
        kind: "system_event",
        nodeId: node.id,
        title: node.data.title,
        body: `${handoffData.config.message} Fila: ${handoffData.config.queue}.`,
        tone: "warning",
      });
      session.paused = true;
      session.currentNodeId = node.id;
      break;
    }

    if (node.type === "end") {
      const endData = getTypedNodeData(node, "end");
      if (!endData) continue;
      session = appendEvent(session, {
        id: makeEventId("end"),
        kind: "system_event",
        nodeId: node.id,
        title: node.data.title,
        body: endData.config.closingMessage,
        tone: endData.config.result === "completed" ? "success" : "neutral",
      });
      session.completed = true;
      session.currentNodeId = null;
      break;
    }
  }

  return session;
}
