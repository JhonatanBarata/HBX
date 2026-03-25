import { createEmptyFlowDefinition, createFlowEdge, createFlowNode } from "./utils";
import type { FlowDefinition } from "./types";

export function createExampleFlow(): FlowDefinition {
  const flow = createEmptyFlowDefinition({
    name: "Exemplo HBX",
    description: "Fluxo demonstrativo para o builder visual.",
    moduleKey: "shared",
  });

  const start = flow.nodes[0];
  const end = flow.nodes[1];
  const greeting = createFlowNode("buttons", { x: 420, y: 40 }, "greeting");
  greeting.data.title = "Boas-vindas";
  greeting.data.summary = "Abre o atendimento com duas opções.";
  greeting.data.config.body = "Olá! Como podemos ajudar você hoje?";
  greeting.data.config.buttons = [
    { id: "btn_finance", label: "Financeiro", value: "financeiro" },
    { id: "btn_human", label: "Atendente", value: "humano" },
  ];

  const finance = createFlowNode("message", { x: 780, y: 0 }, "financeiro");
  finance.data.title = "Resposta financeira";
  finance.data.config.body = "Perfeito. Vou te mostrar as opções financeiras disponíveis.";

  const handoff = createFlowNode("human_handoff", { x: 780, y: 220 }, "handoff");
  handoff.data.title = "Fila humana";
  handoff.data.config.message = "Vou te encaminhar para um atendente agora.";

  return {
    ...flow,
    nodes: [start, greeting, finance, handoff, end],
    edges: [
      createFlowEdge(start.id, greeting.id, null, "começar"),
      createFlowEdge(greeting.id, finance.id, "btn_finance", "Financeiro"),
      createFlowEdge(greeting.id, handoff.id, "btn_human", "Atendente"),
      createFlowEdge(finance.id, end.id, null, "encerrar"),
    ],
  };
}
