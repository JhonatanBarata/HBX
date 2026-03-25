import {
  findStartNode,
  getChoiceOptions,
  getIncomingEdges,
  getMaxOutgoing,
  getOutgoingEdges,
  isTerminalNode,
} from "@/lib/flow-schema/utils";
import type { FlowDefinition, FlowValidationIssue } from "@/lib/flow-schema/types";
import { validateWhatsappRules } from "@/lib/whatsapp-rules";

function makeIssue(input: Omit<FlowValidationIssue, "id">): FlowValidationIssue {
  return {
    id: `${input.code}:${input.nodeId || input.edgeId || "global"}`,
    ...input,
  };
}

export function validateFlowDefinition(definition: FlowDefinition) {
  const issues: FlowValidationIssue[] = [];
  const startNodes = definition.nodes.filter((node) => node.type === "start");

  if (startNodes.length !== 1) {
    issues.push(
      makeIssue({
        severity: "error",
        code: "start_count_invalid",
        message: "O fluxo precisa ter exatamente um StartNode.",
        hint: "Mantenha um bloco inicial e remova os demais.",
      }),
    );
  }

  for (const edge of definition.edges) {
    const source = definition.nodes.find((node) => node.id === edge.source);
    const target = definition.nodes.find((node) => node.id === edge.target);
    if (!source || !target) {
      issues.push(
        makeIssue({
          severity: "error",
          code: "edge_broken_reference",
          edgeId: edge.id,
          message: "Uma conexão aponta para um bloco inexistente.",
        }),
      );
      continue;
    }

    if (source.id === target.id) {
      issues.push(
        makeIssue({
          severity: "error",
          code: "edge_self_reference",
          edgeId: edge.id,
          nodeId: source.id,
          message: "Um bloco não pode conectar em si mesmo.",
        }),
      );
    }
  }

  for (const node of definition.nodes) {
    const outgoing = getOutgoingEdges(definition, node.id);
    const incoming = getIncomingEdges(definition, node.id);
    const maxOutgoing = getMaxOutgoing(node.type);

    if (outgoing.length > maxOutgoing) {
      issues.push(
        makeIssue({
          severity: "error",
          code: "too_many_outgoing",
          nodeId: node.id,
          message: `${node.data.title} excedeu o limite de saídas permitidas.`,
          hint: node.type === "message" ? "Mensagem simples aceita apenas uma saída." : "Revise os caminhos.",
        }),
      );
    }

    if (!isTerminalNode(node.type) && node.type !== "start" && outgoing.length === 0) {
      issues.push(
        makeIssue({
          severity: "error",
          code: "node_without_exit",
          nodeId: node.id,
          message: `${node.data.title} está sem saída.`,
          hint: "Conecte esse bloco ao próximo passo do fluxo.",
        }),
      );
    }

    if (node.type !== "start" && incoming.length === 0) {
      issues.push(
        makeIssue({
          severity: "warning",
          code: "node_unreachable",
          nodeId: node.id,
          message: `${node.data.title} não recebe entrada de nenhum outro bloco.`,
          hint: "Esse bloco pode estar órfão no canvas.",
        }),
      );
    }

    if (node.type === "condition" && node.data.config.cases.length === 0) {
      issues.push(
        makeIssue({
          severity: "error",
          code: "condition_without_cases",
          nodeId: node.id,
          message: "ConditionNode precisa de pelo menos um caso.",
        }),
      );
    }

    if ((node.type === "buttons" || node.type === "list") && getChoiceOptions(node).length === 0) {
      issues.push(
        makeIssue({
          severity: "error",
          code: "interactive_without_options",
          nodeId: node.id,
          message: `${node.data.title} precisa de pelo menos uma opção.`,
        }),
      );
    }
  }

  const startNode = findStartNode(definition);
  if (startNode) {
    const visited = new Set<string>();
    const stack = [startNode.id];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (!currentId || visited.has(currentId)) continue;
      visited.add(currentId);
      for (const edge of getOutgoingEdges(definition, currentId)) {
        stack.push(edge.target);
      }
    }

    for (const node of definition.nodes) {
      if (!visited.has(node.id)) {
        issues.push(
          makeIssue({
            severity: "warning",
            code: "node_not_in_start_path",
            nodeId: node.id,
            message: `${node.data.title} não é alcançável a partir do início.`,
          }),
        );
      }
    }
  }

  return [...issues, ...validateWhatsappRules(definition)];
}
