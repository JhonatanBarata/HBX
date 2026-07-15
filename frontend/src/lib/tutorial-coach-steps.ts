// Fonte ÚNICA dos passos do tour guiado (coachmark). Tour completo (1º acesso,
// 07/07): segue a ORDEM REAL da sidebar (NAV_LINKS) — Dashboard → Vendas →
// Agenda → Automações → Conversas → Empresas → Contatos → Produtos → Logística
// → Bot → Assistente IA → (pergunta IA/Bot) → Relatórios → Website →
// Configurações → checklist → fim. Módulo que o usuário NÃO vê (plano/cargo)
// não vira passo. Os passos de módulo NÃO navegam (o holofote desliza item a
// item na sidebar — trocar de rota a cada passo deixava o tour instável, com
// tela carregando atrás do balão); só Dashboard e checklist ancoram na rota.

import type { CoachStep } from "@/components/hbx/tutorial-coach";

export type CoachRole = "seller" | "manager" | "owner";

// Audiência do tour: papel + a lista REAL de módulos visíveis na sidebar (ids
// do NAV_LINKS do shell) — evita duplicar a regra de visibilidade em booleans.
// navTargets=false (ex.: casca mobile sem sidebar desktop) monta os MESMOS
// passos sem âncora de destaque — o coach não fica esperando alvo inexistente.
export type CoachAudience = {
  role: CoachRole;
  visibleModules: string[];
  navTargets: boolean;
};

const DEFAULT_AUDIENCE: CoachAudience = {
  role: "seller",
  visibleModules: ["dash", "vendas", "atend", "relat", "config"],
  navTargets: true,
};

// Catálogo dos passos por módulo, na ordem canônica da sidebar (NAV_LINKS).
// id = id do NAV_LINKS (o alvo do holofote é [data-tut="nav-<id>"]).
const MODULE_STEPS: Array<{ id: string; title: string; body: string }> = [
  {
    id: "dash",
    title: "Seu painel de controle",
    body: "O Dashboard mostra o que está acontecendo hoje: oportunidades, retornos, conversas, vendas e sinais importantes da operação.",
  },
  {
    id: "vendas",
    title: "O centro da operação",
    body: "Em Vendas ficam o Radar, os leads puxados e o funil. É daqui que a empresa sai da prospecção e vira negociação.",
  },
  {
    id: "agenda",
    title: "O que precisa acontecer hoje",
    body: "A Agenda organiza retornos, tarefas e próximos contatos. Ela evita que lead quente esfrie por esquecimento.",
  },
  {
    id: "automacao",
    title: "Rotinas trabalhando por você",
    body: "Automações servem para criar cadências, lembretes e ações repetidas sem depender de memória manual.",
  },
  {
    id: "atend",
    title: "Atendimento conectado ao WhatsApp",
    body: "Em Conversas você conecta o WhatsApp, responde clientes e acompanha o histórico do lead no mesmo lugar.",
  },
  {
    id: "empresas",
    title: "A base das contas",
    body: "Empresas guarda os negócios encontrados ou cadastrados. É a visão limpa das contas que sua operação pode trabalhar.",
  },
  {
    id: "contatos",
    title: "As pessoas por trás das empresas",
    body: "Contatos organiza donos, compradores, responsáveis e pessoas ligadas às empresas. Venda B2B depende de falar com a pessoa certa.",
  },
  {
    id: "produtos",
    title: "O que sua equipe vende",
    body: "Produtos define o catálogo que aparece no fechamento, nas propostas e na rotina comercial.",
  },
  {
    id: "logistica",
    title: "Quando vender também exige entregar",
    body: "Logística organiza rotas, entregas e confirmação de atendimento quando sua operação precisa sair do comercial e chegar na rua.",
  },
  {
    id: "bot",
    title: "Bot para atendimento automático",
    body: "O Bot ajuda a responder, qualificar e conduzir conversas repetitivas. Ele não substitui a venda; ele tira peso do caminho.",
  },
  {
    id: "assistente",
    title: "Assistente IA da operação",
    body: "O Assistente IA ajuda a testar mensagens, orientar respostas e acelerar tarefas sem mexer no WhatsApp real antes da sua aprovação.",
  },
  {
    id: "relat",
    title: "Os números da operação",
    body: "Relatórios mostram evolução, conversão, desempenho e gargalos. É aqui que o dono entende o que deve ajustar.",
  },
  {
    id: "website",
    title: "Sua presença pública",
    body: "Website é a área para preparar presença digital e páginas ligadas à operação, quando esse módulo estiver liberado.",
  },
  {
    id: "config",
    title: "O controle da empresa",
    body: "Configurações guarda equipe, módulos, preferências e ajustes da conta. O usuário comum vê menos; o dono controla mais.",
  },
];

export function buildCoachSteps(audience: Partial<CoachAudience> = {}): CoachStep[] {
  const a: CoachAudience = { ...DEFAULT_AUDIENCE, ...audience };
  const visible = new Set(a.visibleModules);
  const steps: CoachStep[] = [];

  // 1) Abertura.
  steps.push({
    id: "welcome",
    title: "Vamos montar sua operação.",
    body: "Vou te mostrar a HBX na ordem em que ela funciona: encontrar empresas, trabalhar oportunidades, atender conversas e acompanhar os resultados.",
    gate: "next",
    cta: "Começar",
  });

  // 2) Módulos na ordem REAL da sidebar — só os que o usuário vê. O Dashboard
  // é o passo "limpo" (sem escurecer, texto instantâneo, na própria rota); os
  // demais só destacam o item real do menu — SEM navegar.
  for (const def of MODULE_STEPS) {
    if (!visible.has(def.id)) continue;
    if (def.id === "dash") {
      steps.push({
        id: "mod-dash",
        route: "/dashboard",
        title: def.title,
        body: def.body,
        plain: true,
        gate: "next",
      });
      continue;
    }
    steps.push({
      id: "mod-" + def.id,
      target: a.navTargets ? `[data-tut="nav-${def.id}"]` : undefined,
      title: def.title,
      body: def.body,
      gate: "next",
    });
  }

  // 4) Pergunta IA/Bot — logo depois do último módulo de IA visível (Assistente
  // IA; senão Bot). Sem módulo de IA visível, a pergunta não existe.
  const aiAnchor = Math.max(
    steps.findIndex(s => s.id === "mod-assistente"),
    steps.findIndex(s => s.id === "mod-bot"),
  );
  if (aiAnchor >= 0) {
    steps.splice(aiAnchor + 1, 0, {
      id: "ai-bot-choice",
      choice: "ai-bot",
      title: "Quer configurar IA e Bot agora?",
      body: "Você pode configurar agora ou deixar para depois. A HBX salva sua escolha e continua o tutorial.",
    });
  }

  // 5) Configuração assistida — o bastão passa do tutorial pro concierge.
  steps.push({
    id: "checklist",
    route: "/dashboard",
    target: '[data-tut="ac-checklist"]',
    title: "Termine sua configuração",
    body: "Quando faltar alguma coisa, toque neste ícone. O concierge mostra apenas o próximo passo e abre o que você precisa.",
    gate: "next",
  });

  // 6) Fim — suporte e fechar.
  steps.push({
    id: "final",
    title: "HBX pronto para começar.",
    body: "Você já sabe onde cada coisa mora. Agora é puxar o primeiro lead, conectar o atendimento e colocar a operação para girar.",
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

// Radar (modo "Buscar empresas" DENTRO de /vendas — 27/06 o Radar deixou de ser
// tela própria; /leads redireciona pra /vendas e o LeadsClient roda embutido).
// Por isso os passos vivem na rota "/vendas" e o tour é disparado pelo "Como usar"
// quando o modo está aberto (shell detecta .vnd-layer--buscar.is-on). Fluxo:
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
      body: "Digite o segmento e escolha UF e cidade na mesma linha. Use Avançado só para alcance, canais, dados da Receita e pesquisas salvas.",
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
