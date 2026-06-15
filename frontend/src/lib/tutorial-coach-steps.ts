// Fonte ÚNICA dos passos do tour guiado (coachmark). Por cargo/plano, raso
// (ordem do dono 14/06): Vendedor = Leads → Vendas → Atendimento; Gerente = +
// cadastrar clientes; Dono = + planos. Os TEMAS entram logo no começo ("as
// patifarias"). Dashboard/Relatórios = resumo que escreve sozinho (typewriter).
// Fim = "ver planos avançados? / ficou dúvida?". Tudo nasce daqui.

import type { CoachStep } from "@/components/hbx/tutorial-coach";

export type CoachRole = "seller" | "manager" | "owner";

export type CoachAudience = {
  role: CoachRole;
  hasLeads: boolean;
  hasVendas: boolean;
  hasAtendimento: boolean;
  hasRelatorios: boolean;
};

const DEFAULT_AUDIENCE: CoachAudience = {
  role: "seller",
  hasLeads: true,
  hasVendas: true,
  hasAtendimento: false,
  hasRelatorios: true,
};

export function buildCoachSteps(audience: Partial<CoachAudience> = {}): CoachStep[] {
  const a: CoachAudience = { ...DEFAULT_AUDIENCE, ...audience };
  const steps: CoachStep[] = [];

  // 1) Boas-vindas + os TEMAS já de cara.
  steps.push({
    id: "welcome",
    title: "Essa é a sua casa.",
    body: "Vou te mostrar onde fica cada coisa — rapidinho e no clique. Começando pelas frescuras: dá pra deixar o sistema com a sua cara.",
    gate: "next",
    cta: "Bora",
  });
  steps.push({
    id: "pele",
    target: '[data-tut="pele"]',
    title: "Troque a cor do sistema",
    body: "Aqui em cima você muda a PELE — a cor e o clima de tudo. Clique pra abrir e escolher a que te agrada; quando gostar, toque em Próximo.",
    gate: "next",
  });
  steps.push({
    id: "theme-mode",
    target: '[data-tut="theme-mode"]',
    title: "Claro ou escuro",
    body: "Este botão escurece ou clareia o sistema inteiro. Experimente à vontade — ele lembra da sua escolha. Toque em Próximo quando quiser seguir.",
    gate: "next",
  });

  // 2) Tour pelo coração do sistema (clique-a-clique nos importantes).
  if (a.hasLeads) {
    steps.push({
      id: "go-leads",
      target: '[data-tut="nav-leads"]',
      title: "Seus Leads",
      body: "É aqui que as oportunidades chegam. Clique em Leads pra eu te mostrar.",
      gate: "click",
    });
    steps.push({
      id: "leads-screen",
      route: "/leads",
      title: "A sua lista de oportunidades",
      body: "Cada linha é uma empresa pra abordar. Você filtra por etapa, PUXA leads novos do Radar (por distância) e começa a conversa direto daqui.",
      gate: "next",
    });
  }

  if (a.hasVendas) {
    steps.push({
      id: "go-vendas",
      target: '[data-tut="nav-vendas"]',
      title: "Suas Vendas",
      body: "O funil onde a venda anda até fechar. Clique em Vendas.",
      gate: "click",
    });
    steps.push({
      id: "vendas-screen",
      route: "/vendas",
      title: "A esteira de vendas",
      body: "Arraste o card pelas etapas, registre o resultado da ligação, agende retornos e acompanhe a oportunidade até o fechamento.",
      gate: "next",
    });
    if (a.role !== "seller") {
      steps.push({
        id: "vendas-cadastrar",
        route: "/vendas",
        title: "Cadastrar o cliente",
        body: "Quando a venda fecha, é no card de Vendas que o cliente vira cadastro de verdade — sem digitar tudo de novo. É assim que sua base cresce limpa.",
        gate: "next",
      });
    }
  }

  // 3) Atendimento — se ligado, mostra; se não, mostra que existe (QR ou Meta).
  if (a.hasAtendimento) {
    steps.push({
      id: "go-atendimento",
      target: '[data-tut="nav-atend"]',
      title: "Seu Atendimento",
      body: "As conversas de WhatsApp dos seus leads chegam aqui. Clique em Atendimento.",
      gate: "click",
    });
    steps.push({
      id: "atendimento-screen",
      route: "/atendimento",
      title: "Tudo num lugar só",
      body: "Lê e responde as conversas, manda áudio, anexa, marca etapa e cria tarefas — sem sair do sistema.",
      gate: "next",
    });
  } else {
    steps.push({
      id: "atendimento-off",
      title: "Atendimento por WhatsApp",
      body: "Quando você ligar o Atendimento, as conversas dos leads caem direto aqui. Dá pra conectar pelo QR Code (como o WhatsApp Web) ou oficialmente pela Meta.",
      image: "/meta.webp",
      gate: "next",
    });
  }

  // 4) Dashboard e Relatórios — resumo que escreve sozinho (sem clique-a-clique).
  steps.push({
    id: "dashboard-summary",
    route: "/dashboard",
    title: "Seu panorama",
    body: "O Dashboard é o seu raio-x do dia: quantos leads entraram, quanto está em negociação, o que vence hoje e como anda a conversão. Bate o olho e já sabe pra onde correr.",
    typewriter: true,
    plain: true,
    gate: "next",
  });
  if (a.hasRelatorios) {
    steps.push({
      id: "relatorios-summary",
      route: "/relatorios",
      title: "Os números no tempo",
      body: "Os Relatórios mostram a evolução: vendas por período, desempenho por etapa e por pessoa. É aqui que você enxerga o que está dando certo e dobra a aposta.",
      typewriter: true,
      plain: true,
      gate: "next",
    });
  }

  // 5) Extra do dono: planos.
  if (a.role === "owner") {
    steps.push({
      id: "owner-planos",
      title: "Você é o dono",
      body: "Além de tudo isso, em Configurações → Planos você cria e edita os planos e preços que a sua operação usa. O controle é seu.",
      gate: "next",
    });
  }

  // 6) Fim — planos avançados + falar com a HBX.
  steps.push({
    id: "final",
    title: "Prontinho! 🎉",
    body: "Você já sabe o caminho das pedras. Quer ver tudo que o sistema faz nos planos mais avançados?",
    final: true,
  });

  return steps;
}
