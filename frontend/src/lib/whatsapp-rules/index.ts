import type { FlowBuilderNode, FlowDefinition, FlowValidationIssue } from "@/lib/flow-schema/types";

export const WHATSAPP_BUTTON_LIMIT = 3;
export const WHATSAPP_LIST_LIMIT = 10;

function createIssue(input: Omit<FlowValidationIssue, "id">): FlowValidationIssue {
  return {
    id: `${input.code}:${input.nodeId || input.edgeId || "global"}`,
    ...input,
  };
}

function nodeRequiresTemplateOutsideWindow(node: FlowBuilderNode) {
  return ["message", "question", "buttons", "list"].includes(node.type);
}

export function validateWhatsappRules(definition: FlowDefinition) {
  const issues: FlowValidationIssue[] = [];

  for (const node of definition.nodes) {
    if (node.type === "buttons" && node.data.config.buttons.length > WHATSAPP_BUTTON_LIMIT) {
      issues.push(
        createIssue({
          severity: "error",
          code: "wa_buttons_limit",
          nodeId: node.id,
          message: "ButtonsNode aceita no máximo 3 botões.",
          hint: "Reduza a quantidade de opções ou converta o bloco para ListNode.",
        }),
      );
    }

    if (node.type === "list" && node.data.config.options.length > WHATSAPP_LIST_LIMIT) {
      issues.push(
        createIssue({
          severity: "error",
          code: "wa_list_limit",
          nodeId: node.id,
          message: "ListNode aceita no máximo 10 opções.",
          hint: "Quebre a lista em etapas menores.",
        }),
      );
    }

    if (!definition.runtime.within24hWindow && nodeRequiresTemplateOutsideWindow(node)) {
      issues.push(
        createIssue({
          severity: "error",
          code: "wa_template_required",
          nodeId: node.id,
          message: "Fora da janela de 24h o fluxo deve usar TemplateNode.",
          hint: "Substitua a mensagem por TemplateNode ou volte o teste para dentro da janela.",
        }),
      );
    }
  }

  return issues;
}
