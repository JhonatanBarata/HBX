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
    // TODO (modelo de atendimento): quando o plano "lead+" tiver um step de onboarding
    // definido, adicionar aqui um card explicando os 2 modelos (Compartilhado e Individual)
    // e como chegar no painel: /atendimento → botão "Modelo" no cabeçalho da lista.
    // Exemplo de step: { id: "atendimento-modelo", title: "Compartilhado ou Individual?",
    //   body: "...", gate: "next", route: "/atendimento" }
    // Aguardando definição do fluxo de onboarding do plano "lead+" para plugar aqui.
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

  // 6) Fim — suporte e fechar.
  steps.push({
    id: "final",
    title: "Prontinho! 🎉",
    body: "Agora vc já sabe o básico do HBX, ficou mais alguma dúvida?",
    final: true,
  });

  return steps;
}

// ───────────────────────────────────────────────────────────────────────────
// TOURS POR MÓDULO (desmembrado, 23/06). Cada módulo tem seu tour PROFUNDO, que
// destaca os elementos REAIS da tela (âncoras data-tut na própria page.client),
// disparado pelo botão "Como usar" do topo. Diferente do tour completo acima,
// que é a orientação rasa de primeiro acesso ("aqui MORA cada coisa"). Cada
// elemento destacado precisa do data-tut correspondente na tela.
//
// ALVO ausente (cargo/plano não tem, ou mobile que não renderiza aquele bloco)
// NÃO trava: o coach espera ~4s e pula sozinho. Foco do POC = desktop.

// Radar (slide "Buscar empresas" DENTRO de /vendas — 27/06 o Radar deixou de ser
// tela própria; /leads redireciona pra /vendas e o LeadsClient roda embutido).
// Por isso os passos vivem na rota "/vendas" e o tour é disparado pelo "Como usar"
// quando a slide está aberta (shell detecta .vnd-slidetrack.is-buscar). Fluxo:
// tamanho do lago → mirar filtro → ligar o motor → prateleira/carteira → puxar → cota.
function leadsModuleSteps(): CoachStep[] {
  return [
    {
      id: "leads-intro",
      route: "/vendas",
      title: "Este é o seu Radar",
      body: "É aqui que você acha empresas pra vender. Vou te mostrar cada parte em poucos toques.",
      gate: "next",
      cta: "Bora",
    },
    {
      id: "leads-kpis",
      route: "/vendas",
      target: '[data-tut="leads-kpis"]',
      title: "O tamanho do lago",
      body: "Esse número é o Brasil inteiro: o total de empresas que o Radar já tem catalogadas pra você garimpar.",
      gate: "next",
    },
    {
      id: "leads-filtros",
      route: "/vendas",
      target: '[data-tut="leads-filtros"]',
      title: "Aqui você mira",
      body: "Escolha estado, cidade e alcance — e logo abaixo o segmento que você atende. É o que diz pro Radar o tipo de empresa que você procura.",
      gate: "next",
    },
    {
      id: "leads-buscar",
      route: "/vendas",
      target: '[data-tut="leads-buscar"]',
      title: "Liga o motor",
      body: "Isso manda o Radar varrer a internet com a sua cidade e segmento e trazer empresas novinhas pra prateleira.",
      gate: "next",
    },
    {
      id: "leads-abas",
      route: "/vendas",
      target: '[data-tut="leads-abas"]',
      title: "Prateleira e carteira",
      body: "“Disponíveis” é a prateleira, com o contato ainda escondido. Quando você puxa, a empresa vira sua e o contato libera.",
      gate: "next",
    },
    {
      id: "leads-puxar",
      route: "/vendas",
      target: '[data-tut="leads-puxar"]',
      title: "Puxar pra você",
      body: "Marque as empresas e clique aqui: o contato aparece e elas entram na sua carteira, prontas pra abordar.",
      gate: "next",
    },
    {
      id: "leads-cota",
      route: "/vendas",
      target: '[data-tut="leads-cota"]',
      title: "Seu limite",
      body: "Mostra quantas empresas você pode ter em mãos. Encheu? Feche uma venda ou agende um retorno pra abrir vaga.",
      gate: "next",
    },
  ];
}

// Atendimento (/atendimento): conectar WhatsApp → ler conversas → responder →
// ficha do lead. Passo "modelo" só existe pra admin (botão some pro vendedor →
// o coach pula sozinho). Painel/compose somem no celular na vista de lista (pula).
function atendimentoModuleSteps(): CoachStep[] {
  return [
    {
      id: "atend-intro",
      route: "/atendimento",
      title: "Este é o seu Atendimento",
      body: "Aqui você fala com seus leads pelo WhatsApp, tudo num lugar só. Vou te mostrar cada parte.",
      gate: "next",
      cta: "Bora",
    },
    {
      id: "atend-whatsapp",
      route: "/atendimento",
      target: '[data-tut="atend-whatsapp"]',
      title: "Conecte seu WhatsApp",
      body: "Esse selo mostra a conexão. Clique pra parear seu número, igual ao WhatsApp Web. Verde = conectado e recebendo mensagens.",
      gate: "next",
    },
    {
      id: "atend-lista",
      route: "/atendimento",
      target: '[data-tut="atend-lista"]',
      title: "Suas conversas",
      body: "Toda conversa dos seus leads cai aqui na hora que a mensagem chega — a mais recente sobe pro topo.",
      gate: "next",
    },
    {
      id: "atend-abas",
      route: "/atendimento",
      target: '[data-tut="atend-abas"]',
      title: "Filtre rápido",
      body: "Veja Todas, só as Não lidas, ou apenas as Minhas conversas.",
      gate: "next",
    },
    {
      id: "atend-busca",
      route: "/atendimento",
      target: '[data-tut="atend-busca"]',
      title: "Achar alguém",
      body: "Procure uma conversa pelo nome ou número, sem rolar a lista toda.",
      gate: "next",
    },
    {
      id: "atend-nova",
      route: "/atendimento",
      target: '[data-tut="atend-nova"]',
      title: "Começar do zero",
      body: "Clique em Nova pra puxar conversa com um número que ainda não te chamou.",
      gate: "next",
    },
    {
      id: "atend-responder",
      route: "/atendimento",
      target: '[data-tut="atend-responder"]',
      title: "Responder",
      body: "Digite e mande. Dá pra usar emoji, anexar arquivo, gravar áudio na hora e inserir mensagens prontas.",
      gate: "next",
    },
    {
      id: "atend-painel",
      route: "/atendimento",
      target: '[data-tut="atend-painel"]',
      title: "Tudo sobre o lead",
      body: "Do lado direito ficam os dados do cliente, suas observações, a etapa da venda, o agendar retorno e o histórico — sem sair da conversa.",
      gate: "next",
    },
    {
      id: "atend-modelo",
      route: "/atendimento",
      target: '[data-tut="atend-modelo"]',
      title: "Como o time atende",
      body: "Escolha o modelo: todo mundo vê todas as conversas (Compartilhado) ou cada vendedor só as suas (Individual).",
      gate: "next",
    },
  ];
}

// Vendas (/vendas): funil onde o card caminha até fechar. Visão padrão = Lista
// (o passo "funil" mira a tabela; em Quadro/funil vazio ele pula sozinho). Cabeçalho
// (visão/novo/prospecção/agenda) e o painel direito são sempre-presentes no desktop.
function vendasModuleSteps(): CoachStep[] {
  return [
    {
      id: "vendas-intro",
      route: "/vendas",
      title: "Este é o seu funil de Vendas",
      body: "Aqui cada lead que você puxou vira um card e caminha até a venda fechar. Vou te mostrar como tocar.",
      gate: "next",
      cta: "Bora",
    },
    {
      id: "vendas-visao",
      route: "/vendas",
      target: '[data-tut="vendas-visao"]',
      title: "Lista ou Quadro",
      body: "Veja seu funil como lista ou como quadro. No Quadro você arrasta o card de uma etapa pra outra conforme a negociação anda.",
      gate: "next",
    },
    {
      id: "vendas-funil",
      route: "/vendas",
      target: '[data-tut="vendas-funil"]',
      title: "Sua carteira por etapa",
      body: "Cada lead aparece agrupado pela etapa em que está. Clique num card pra abrir os detalhes e trabalhar.",
      gate: "next",
    },
    {
      id: "vendas-painel",
      route: "/vendas",
      target: '[data-tut="vendas-painel"]',
      title: "Trabalhe o lead aqui",
      body: "No painel do lado você registra o resultado da ligação, agenda o retorno e fecha a venda — sem sair da tela.",
      gate: "next",
    },
    {
      id: "vendas-novo",
      route: "/vendas",
      target: '[data-tut="vendas-novo"]',
      title: "Cadastrar na mão",
      body: "Quer um lead que não veio do Radar? Clique em Novo lead e adicione você mesmo.",
      gate: "next",
    },
    {
      id: "vendas-prosp",
      route: "/vendas",
      target: '[data-tut="vendas-prosp"]',
      title: "Robô buscando por você",
      body: "Liga a prospecção automática pra encher seu funil sozinho, sem garimpar lead a lead.",
      gate: "next",
    },
    {
      id: "vendas-agenda",
      route: "/vendas",
      target: '[data-tut="vendas-agenda"]',
      title: "Não perca o retorno",
      body: "A agenda junta tudo que você marcou pra retornar — ligue na hora certa e não esfrie o lead.",
      gate: "next",
    },
  ];
}

// De-para módulo → passos. Crescer aqui ao desmembrar os próximos (Bot/Relatórios).
const MODULE_TOUR_BUILDERS: Record<string, () => CoachStep[]> = {
  leads: leadsModuleSteps,
  atendimento: atendimentoModuleSteps,
  vendas: vendasModuleSteps,
};

// Tour de UM módulo: passos profundos + um fecho curto (com "falar com a HBX").
// Módulo sem tour cai no tour completo (fallback seguro). `audience` segue na
// assinatura pro fallback e pros tours por-cargo que virão.
export function buildModuleTour(moduleId: string, audience: Partial<CoachAudience> = {}): CoachStep[] {
  const build = MODULE_TOUR_BUILDERS[moduleId];
  if (!build) return buildCoachSteps(audience);
  const steps = build();
  steps.push({
    id: `${moduleId}-final`,
    title: "Pronto! ✨",
    body: "É isso. Toque em Finalizar e comece a usar — ou chame a gente se ficou alguma dúvida.",
    final: true,
  });
  return steps;
}
