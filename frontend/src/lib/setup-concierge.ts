// Catálogo fechado do concierge de configuração. A conversa pode explicar e
// sugerir; somente estas ações viram efeito no HBX. Nenhum texto da IA vira
// rota, endpoint ou comando arbitrário.

export type SetupNavigateAction = {
  kind: "navigate";
  href: SetupHref;
  hints?: { "hbx:abrir-novo-lead"?: "1" };
};

export type SetupAction =
  | SetupNavigateAction
  | { kind: "company_segment" }
  | { kind: "notice"; message: string }
  | { kind: "concierge_search" }
  | { kind: "whatsapp_qr" }
  | { kind: "whatsapp_code" }
  | { kind: "whatsapp_full" };

export type SetupSolution = {
  id: string;
  label: string;
  description?: string;
  action: SetupAction;
};

export type SetupOffer = {
  intro: string;
  guidance: string[];
  solutions: SetupSolution[];
};

const SETUP_HREFS = [
  "/configuracoes",
  "/configuracoes?sec=M%C3%B3dulos",
  "/leads",
  "/vendas",
  "/conversas",
  "/gerencial?aba=4",
  "/gerencial?aba=4&novo=1",
] as const;
export type SetupHref = (typeof SETUP_HREFS)[number];
const SAFE_FALLBACKS = new Set<string>(["/configuracoes", "/vendas", "/conversas"]);
const SETUP_HREF_SET = new Set<string>(SETUP_HREFS);

function navigate(id: string, label: string, href: SetupHref, hints?: SetupNavigateAction["hints"]): SetupSolution {
  return { id, label, action: { kind: "navigate", href, hints } };
}

export function isAllowedSetupNavigation(action: SetupNavigateAction): boolean {
  if (!SETUP_HREF_SET.has(action.href)) return false;
  return Object.entries(action.hints || {}).every(([key, value]) => key === "hbx:abrir-novo-lead" && value === "1");
}

export function getSetupOffer(step: { key: string; href: string }, options: {
  conciergeAccessible: boolean;
  radarAccessible: boolean;
  vendasAccessible: boolean;
  atendimentoAccessible: boolean;
  gerencialAccessible: boolean;
}): SetupOffer {
  const { conciergeAccessible, radarAccessible, vendasAccessible, atendimentoAccessible, gerencialAccessible } = options;
  switch (step.key) {
    case "company_identity_set":
      return {
        intro: "Primeiro, defina quem sua empresa quer encontrar.",
        guidance: ["Informe os ramos que deseja prospectar.", "Separe ramos diferentes por vírgula.", "Depois você pode completar os demais dados em Configurações."],
        solutions: [
          { id: "company-segment", label: "Definir meu ramo aqui", action: { kind: "company_segment" } },
          navigate("company", "Abrir configurações completas", "/configuracoes"),
        ],
      };
    case "first_module_confirmed":
      return {
        intro: "Os módulos já vêm do seu plano; você só precisa revisar.",
        guidance: ["Veja as categorias disponíveis.", "Mantenha apenas o que sua operação vai usar.", "As regras de plano e acesso continuam protegidas pelo HBX."],
        solutions: [navigate("modules", "Revisar meus módulos", "/configuracoes?sec=M%C3%B3dulos")],
      };
    case "lead_pulled": {
      if (!radarAccessible) {
        return {
          intro: "O Radar não está liberado para este usuário.",
          guidance: ["Peça ao administrador para revisar seus módulos e acessos.", "O concierge não libera recursos por conta própria."],
          solutions: [{ id: "radar-locked", label: "Entender o bloqueio", action: { kind: "notice", message: "Seu acesso ao Radar precisa ser liberado pelo administrador da empresa." } }],
        };
      }
      const solutions: SetupSolution[] = [];
      solutions.push(navigate("radar-manual", "Preencher a busca", "/leads"));
      if (conciergeAccessible) {
        solutions.push({ id: "radar-concierge", label: "Buscar por conversa", action: { kind: "concierge_search" } });
      }
      solutions.push(navigate("lead-manual", "Cadastrar um lead", "/vendas", { "hbx:abrir-novo-lead": "1" }));
      return {
        intro: conciergeAccessible ? "Como você prefere trazer o primeiro lead?" : "Posso abrir a busca e mostrar exatamente o que preencher.",
        guidance: ["Use a busca para encontrar empresas reais.", "Revise o resultado antes de confirmar.", "Se já conhece o contato, use o cadastro manual."],
        solutions,
      };
    }
    case "whatsapp_connected":
      if (!atendimentoAccessible) {
        return {
          intro: "O Atendimento não está liberado para este usuário.",
          guidance: ["Peça ao administrador para revisar seus módulos e acessos.", "Nenhuma conexão será iniciada sem permissão."],
          solutions: [{ id: "whatsapp-locked", label: "Entender o bloqueio", action: { kind: "notice", message: "Seu acesso ao Atendimento precisa ser liberado antes de conectar o WhatsApp." } }],
        };
      }
      return {
        intro: "Escolha a forma mais fácil para conectar seu WhatsApp.",
        guidance: ["No WhatsApp, abra Aparelhos conectados.", "QR Code é o caminho mais rápido no computador.", "Código funciona sem usar a câmera."],
        solutions: [
          { id: "whatsapp-qr", label: "Mostrar QR Code", action: { kind: "whatsapp_qr" } },
          { id: "whatsapp-code", label: "Usar código", action: { kind: "whatsapp_code" } },
          { id: "whatsapp-full", label: "Mais opções", action: { kind: "whatsapp_full" } },
        ],
      };
    case "first_conversation_started":
    case "first_conversation":
      if (!atendimentoAccessible) {
        return {
          intro: "O Atendimento precisa estar liberado antes da primeira conversa.",
          guidance: ["Peça ao administrador para revisar módulos e acessos."],
          solutions: [{ id: "conversation-locked", label: "Entender o bloqueio", action: { kind: "notice", message: "Seu acesso ao Atendimento ainda não está liberado." } }],
        };
      }
      return {
        intro: "Você pode começar pela conversa ou voltar ao lead que quer atender.",
        guidance: ["Abra Conversas.", "Escolha um contato.", "Revise a mensagem e envie você mesmo."],
        solutions: [
          navigate("conversations", "Abrir Conversas", "/conversas"),
          ...(vendasAccessible ? [navigate("conversation-leads", "Escolher pelo funil", "/vendas")] : []),
        ],
      };
    case "first_deal_closed":
      if (!vendasAccessible) {
        return {
          intro: "Vendas precisa estar liberado antes do primeiro fechamento.",
          guidance: ["Peça ao administrador para revisar módulos e acessos."],
          solutions: [{ id: "sales-locked", label: "Entender o bloqueio", action: { kind: "notice", message: "Seu acesso a Vendas ainda não está liberado." } }],
        };
      }
      return {
        intro: "Posso abrir o funil para você concluir um negócio existente.",
        guidance: ["Escolha o negócio no funil.", "Revise cliente, produto e valor.", "A confirmação da venda continua sendo sua."],
        solutions: [navigate("sales", "Abrir meu funil", "/vendas")],
      };
    case "first_seller_invited":
      if (!gerencialAccessible) {
        return {
          intro: "A gestão da equipe não está liberada para este usuário.",
          guidance: ["Somente um perfil autorizado pode criar e liberar acessos."],
          solutions: [{ id: "seller-invite-locked", label: "Entender o bloqueio", action: { kind: "notice", message: "Peça ao dono da empresa para liberar a gestão da equipe." } }],
        };
      }
      return {
        intro: "Posso abrir o convite pronto para preencher ou mostrar sua equipe.",
        guidance: ["Tenha nome e e-mail do vendedor.", "Escolha o perfil de acesso.", "Revise antes de criar o usuário."],
        solutions: [
          navigate("seller-invite", "Convidar vendedor", "/gerencial?aba=4&novo=1"),
          navigate("seller-team", "Ver minha equipe", "/gerencial?aba=4"),
        ],
      };
    case "first_seller_released":
      if (!gerencialAccessible) {
        return {
          intro: "A gestão da equipe não está liberada para este usuário.",
          guidance: ["Somente um perfil autorizado pode revisar e liberar acessos."],
          solutions: [{ id: "seller-release-locked", label: "Entender o bloqueio", action: { kind: "notice", message: "Peça ao dono da empresa para liberar a gestão da equipe." } }],
        };
      }
      return {
        intro: "A liberação é uma decisão sua; eu levo você até a equipe.",
        guidance: ["Abra a equipe.", "Escolha o vendedor.", "Revise o perfil e os acessos antes de liberar."],
        solutions: [navigate("seller-release", "Revisar equipe e acessos", "/gerencial?aba=4")],
      };
    default: {
      const href = (SAFE_FALLBACKS.has(step.href) ? step.href : "/configuracoes") as SetupHref;
      return {
        intro: "Posso abrir a tela segura para você continuar.",
        guidance: ["Abra a tela indicada.", "Revise as informações.", "Confirme somente quando estiver tudo certo."],
        solutions: [navigate("safe-fallback", "Continuar no HBX", href)],
      };
    }
  }
}
