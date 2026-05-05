import {
  buildAgendaActionId,
  type AtendimentoAgendaConfig,
  type AtendimentoBotButton,
  type AtendimentoBotConfig,
} from "../../atendimento/inbox-model";

export type BotQrWorkspaceTab = "connection" | "atendimento" | "flow" | "prospeccao" | "recovery";

export type BotQrPreviewScenarioId =
  | "new_customer"
  | "known_customer"
  | "debt_customer"
  | "human_handoff"
  | "bot_off"
  | "name_confirmation";

export type BotQrEditorBlockId =
  | "entryGreeting"
  | "newCustomer"
  | "returningCustomer"
  | "nameConfirmation"
  | "mainMenu"
  | "recovery"
  | "agenda"
  | "humanHandoff"
  | "closing"
  | "botOff";

export type BotQrMessageField =
  | "welcomeMessage"
  | "returningCustomerMessage"
  | "mainMenuPrompt"
  | "recoveryDetectedMessage"
  | "postActionPrompt"
  | "humanAckMessage"
  | "closeTopicMessage"
  | "blockedMessage";

export type BotQrButtonField =
  | "welcomeButtons"
  | "returningCustomerButtons"
  | "mainMenuButtons"
  | "recoveryDetectedButtons"
  | "postActionButtons";

export type BotQrFlowStripItem = {
  id: string;
  step: number;
  title: string;
  subtitle: string;
  microLabel: string;
  happens: string;
  note: string;
  tone: "gold" | "cyan" | "blue" | "green" | "orange" | "teal" | "red" | "slate";
};

export type BotQrActionOption = {
  value: string;
  label: string;
  description: string;
  nextNodeId: string;
  targetLabel: string;
  kindLabel: string;
  enabled: boolean;
};

export type BotQrEditorBlock = {
  id: BotQrEditorBlockId;
  title: string;
  subtitle: string;
  description: string;
  tone: "gold" | "cyan" | "blue" | "green" | "orange" | "teal" | "red" | "slate";
  messageField: BotQrMessageField | null;
  buttonsField: BotQrButtonField | null;
  messageText: string;
  previewText: string;
  fallbackText: string;
  buttons: AtendimentoBotButton[];
  enabled: boolean;
  editableMessage: boolean;
  editableButtons: boolean;
  helper: string;
  statusNote: string;
  lockedNote?: string;
  toggle?: {
    key: "finance" | "bot";
    label: string;
    description: string;
    active: boolean;
  };
};

export type BotQrPreviewMessage = {
  id: string;
  role: "customer" | "bot" | "system" | "agent";
  label: string;
  text: string;
  buttons?: string[];
  subtle?: boolean;
};

export type BotQrScenarioOption = {
  id: BotQrPreviewScenarioId;
  label: string;
  description: string;
};

export const BOT_QR_FLOW_STRIP: BotQrFlowStripItem[] = [
  {
    id: "setup",
    step: 1,
    title: "Configuracao",
    subtitle: "QR-first sem ruido",
    microLabel: "QR",
    happens: "O operador ativa o caminho principal por QR e acompanha o status em tempo real.",
    note: "Sem Meta como foco principal nesta entrega.",
    tone: "gold",
  },
  {
    id: "inbound",
    step: 2,
    title: "Mensagem recebida",
    subtitle: "Entrada controlada",
    microLabel: "IN",
    happens: "Toda conversa parte do inbound real do WhatsApp, sem disparo automatico escondido.",
    note: "Fluxo QR-first e operacao controlada.",
    tone: "cyan",
  },
  {
    id: "contact",
    step: 3,
    title: "Criar / encontrar contato",
    subtitle: "Telefone como chave",
    microLabel: "CRM",
    happens: "O backend localiza por telefone, cria o minimo quando precisa e preserva o CustomerProfile.",
    note: "Sem schema paralelo nem nova persistencia concorrente.",
    tone: "blue",
  },
  {
    id: "name",
    step: 4,
    title: "Confirmar nome",
    subtitle: "Pergunta simples",
    microLabel: "NOME",
    happens: "Se o nome ainda nao estiver confirmado, o bot pergunta como deve chamar o cliente.",
    note: "Segue depois para o menu principal com contexto salvo.",
    tone: "green",
  },
  {
    id: "menu",
    step: 5,
    title: "Iniciar bot inteligente",
    subtitle: "Menu principal claro",
    microLabel: "MENU",
    happens: "O cliente escolhe o proximo passo em linguagem operacional, sem ids tecnicos.",
    note: "Menu, agenda, financeiro ou humano na mesma casca visual.",
    tone: "teal",
  },
  {
    id: "exit-rules",
    step: 6,
    title: "Condicoes de saida",
    subtitle: "Sem automacao escondida",
    microLabel: "SAIDA",
    happens: "O fluxo respeita financeiro quando existir, encerra quando precisa e nao dispara nada sozinho.",
    note: "Produto operacional, nao disparador automatico.",
    tone: "orange",
  },
  {
    id: "handoff",
    step: 7,
    title: "Handoff humano",
    subtitle: "Historico preservado",
    microLabel: "HUM",
    happens: "Quando sai do bot, abre contexto humano com nome, telefone e historico intactos.",
    note: "Fila humana sem perder o que o cliente ja falou.",
    tone: "red",
  },
  {
    id: "bot-off",
    step: 8,
    title: "BOT_OFF persistente",
    subtitle: "Controle claro",
    microLabel: "OFF",
    happens: "Quando o BOT_OFF esta ligado, o bot nao responde e a operacao segue direto para humano.",
    note: "Estado visual claro e persistido na configuracao atual.",
    tone: "slate",
  },
];

export const BOT_QR_PREVIEW_SCENARIOS: BotQrScenarioOption[] = [
  {
    id: "new_customer",
    label: "Cliente novo",
    description: "Chegou pelo QR e ainda precisa passar pela trilha inicial.",
  },
  {
    id: "known_customer",
    label: "Cliente ja conhecido",
    description: "Telefone encontrado e conversa retomada do ponto certo.",
  },
  {
    id: "debt_customer",
    label: "Cliente com debito",
    description: "Recovery aparece como contexto, sem virar outro produto.",
  },
  {
    id: "human_handoff",
    label: "Cliente pedindo humano",
    description: "Saida do bot com contexto preservado para o time.",
  },
  {
    id: "bot_off",
    label: "Cliente com BOT_OFF",
    description: "Mostra claramente que nao existe resposta automatica ativa.",
  },
  {
    id: "name_confirmation",
    label: "Sem nome confirmado",
    description: "Representa a pergunta operacional de confirmacao de nome.",
  },
];

function normalizeActionId(value: string) {
  return String(value || "").trim().toLowerCase();
}

function humanizeActionKind(kind: string) {
  switch (normalizeActionId(kind)) {
    case "human_handoff":
      return "Humano";
    case "recovery_handoff":
      return "Financeiro";
    case "close":
      return "Encerrar";
    case "show_menu":
      return "Menu";
    case "agenda":
      return "Agenda";
    default:
      return "Resposta";
  }
}

function getActionGuide(config: AtendimentoBotConfig, actionId: string) {
  const normalized = normalizeActionId(actionId);
  return (config.actionCatalog || []).find(
    (action) => normalizeActionId(String(action.actionId || "")) === normalized,
  ) || null;
}

function buildTemplateSamples(config: AtendimentoBotConfig, overrides?: Record<string, string>) {
  const baseEntries = (config.variableCatalog || []).map((item) => [
    item.key,
    String(item.example || item.label || item.key),
  ]);
  return Object.fromEntries([...baseEntries, ...Object.entries(overrides || {})]);
}

function resolveActionTarget(actionId: string, config: AtendimentoBotConfig) {
  const normalized = normalizeActionId(actionId);
  const guide = getActionGuide(config, normalized);

  if (normalized.startsWith("agenda:")) {
    return { nextNodeId: "agendaDispatch", targetLabel: "Agenda" };
  }

  if (normalized === "start_quick_registration") {
    return { nextNodeId: "registrationCapture", targetLabel: "Confirmar nome" };
  }
  if (normalized === "talk_human") {
    return { nextNodeId: "humanAckMessage", targetLabel: "Passar para humano" };
  }
  if (normalized === "close_topic") {
    return { nextNodeId: "closeTopicMessage", targetLabel: "Encerramento" };
  }
  if (normalized === "show_main_menu" || normalized === "continue_journey") {
    return { nextNodeId: "mainMenuPrompt", targetLabel: "Menu principal" };
  }
  if (normalized === "enter_recovery") {
    return { nextNodeId: "recoveryDetectedMessage", targetLabel: "Financeiro / recovery" };
  }

  switch (guide?.kind) {
    case "human_handoff":
      return { nextNodeId: "humanAckMessage", targetLabel: "Passar para humano" };
    case "recovery_handoff":
      return { nextNodeId: "recoveryDetectedMessage", targetLabel: "Financeiro / recovery" };
    case "close":
      return { nextNodeId: "closeTopicMessage", targetLabel: "Encerramento" };
    case "show_menu":
      return { nextNodeId: "mainMenuPrompt", targetLabel: "Menu principal" };
    case "agenda":
      return { nextNodeId: "agendaDispatch", targetLabel: "Agenda" };
    default:
      return { nextNodeId: "postActionPrompt", targetLabel: "Continuidade" };
  }
}

function allButtons(config: AtendimentoBotConfig) {
  return [
    ...(config.welcomeButtons || []),
    ...(config.returningCustomerButtons || []),
    ...(config.mainMenuButtons || []),
    ...(config.recoveryDetectedButtons || []),
    ...(config.postActionButtons || []),
  ];
}

function hasButtonAction(config: AtendimentoBotConfig, actionId: string) {
  const normalized = normalizeActionId(actionId);
  return allButtons(config).some((button) => normalizeActionId(button.actionId) === normalized);
}

function hasAgendaRoute(config: AtendimentoBotConfig) {
  return allButtons(config).some((button) => normalizeActionId(button.actionId).startsWith("agenda:"));
}

export function renderConfigText(
  message: string,
  config: AtendimentoBotConfig,
  overrides?: Record<string, string>,
) {
  const samples = buildTemplateSamples(config, overrides);
  return String(message || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    return String(samples[key] || `{{${key}}}`);
  });
}

export function buildFallbackText(message: string, buttons: AtendimentoBotButton[]) {
  const lines = (buttons || [])
    .filter((button) => String(button.title || "").trim())
    .map((button, index) => `${index + 1}. ${String(button.title || "").trim()}`)
    .join("\n");
  return lines ? `${message}\n\n${lines}`.trim() : message;
}

export function buildActionOptions(config: AtendimentoBotConfig, agendaConfig: AtendimentoAgendaConfig) {
  const options = new Map<string, BotQrActionOption>();

  for (const action of config.actionCatalog || []) {
    const actionId = String(action.actionId || "").trim();
    if (!actionId) continue;
    const target = resolveActionTarget(actionId, config);
    options.set(actionId, {
      value: actionId,
      label: action.title,
      description: action.description,
      nextNodeId: target.nextNodeId,
      targetLabel: target.targetLabel,
      kindLabel: humanizeActionKind(action.kind),
      enabled: action.enabled,
    });
  }

  for (const group of agendaConfig.groups || []) {
    const actionId = buildAgendaActionId(group.id);
    if (options.has(actionId)) continue;
    options.set(actionId, {
      value: actionId,
      label: `Agenda • ${group.title}`,
      description: group.description || "Abre uma agenda operacional real dentro do fluxo atual.",
      nextNodeId: "agendaDispatch",
      targetLabel: "Agenda",
      kindLabel: "Agenda",
      enabled: group.isActive,
    });
  }

  return Array.from(options.values());
}

function previewMessage(message: string, config: AtendimentoBotConfig, buttons?: AtendimentoBotButton[]) {
  const rendered = renderConfigText(message, config, {
    cliente: "Rafaela",
    empresa: "HBX Prime",
    funcionario: "Time HBX",
    valor_formatado: "R$ 480,00",
    agenda_nome: "Instalacao tecnica",
    agenda_slots: "Qui 14:00",
  });
  return {
    text: rendered,
    fallback: buildFallbackText(rendered, buttons || []),
  };
}

export function buildEditorBlocks(config: AtendimentoBotConfig, agendaConfig: AtendimentoAgendaConfig) {
  const financeEnabled =
    config.routingRules.checkRecoveryBeforeReply && config.routingRules.autoRouteDebtorsToRecovery;
  const quickRegistrationEnabled = hasButtonAction(config, "start_quick_registration");
  const humanRouteEnabled = hasButtonAction(config, "talk_human") || Boolean(getActionGuide(config, "talk_human")?.enabled);
  const agendaCount = (agendaConfig.groups || []).filter((group) => group.isActive).length;
  const welcomePreview = previewMessage(config.welcomeMessage, config, config.welcomeButtons);
  const returningPreview = previewMessage(
    config.returningCustomerMessage,
    config,
    config.returningCustomerButtons,
  );
  const mainMenuPreview = previewMessage(config.mainMenuPrompt, config, config.mainMenuButtons);
  const recoveryPreview = previewMessage(
    config.recoveryDetectedMessage,
    config,
    config.recoveryDetectedButtons,
  );
  const postActionPreview = previewMessage(config.postActionPrompt, config, config.postActionButtons);
  const humanPreview = previewMessage(config.humanAckMessage, config);
  const closePreview = previewMessage(config.closeTopicMessage, config);
  const blockedPreview = previewMessage(config.blockedMessage, config);

  return [
    {
      id: "entryGreeting",
      title: "Entrada / saudacao",
      subtitle: "Primeira resposta do QR",
      description: "Mensagem inicial para o inbound que chegou pela trilha QR-first.",
      tone: "gold",
      messageField: "welcomeMessage",
      buttonsField: "welcomeButtons",
      messageText: String(config.welcomeMessage || ""),
      previewText: welcomePreview.text,
      fallbackText: welcomePreview.fallback,
      buttons: config.welcomeButtons,
      enabled: config.routingRules.globalBotEnabled,
      editableMessage: true,
      editableButtons: true,
      helper: `${config.welcomeButtons.length} botoes prontos na primeira resposta.`,
      statusNote: config.routingRules.globalBotEnabled ? "Bot ligado na entrada." : "BOT_OFF global ativo.",
    },
    {
      id: "newCustomer",
      title: "Cliente novo",
      subtitle: "Criar ou encontrar contato",
      description: "O motor atual localiza por telefone, cria o minimo e mantem compatibilidade com CustomerProfile.",
      tone: "cyan",
      messageField: null,
      buttonsField: null,
      messageText: "Telefone inbound -> localizar contato -> criar minimo -> seguir fluxo.",
      previewText:
        "Telefone recebido. O backend localiza o contato, cria o minimo quando precisa e salva o contexto sem abrir outro cadastro paralelo.",
      fallbackText:
        "Telefone recebido. O backend localiza o contato, cria o minimo quando precisa e salva o contexto sem abrir outro cadastro paralelo.",
      buttons: [],
      enabled: quickRegistrationEnabled,
      editableMessage: false,
      editableButtons: false,
      helper: quickRegistrationEnabled
        ? "Cadastro rapido visivel para o operador dentro da saudacao atual."
        : "Sem cadastro rapido evidente na saudacao atual.",
      statusNote: "Reaproveitado do backend atual do Atendimento.",
      lockedNote:
        "Passo operacional representado aqui sem recriar outro motor. A criacao/encontro do contato continua no fluxo backend ja existente.",
    },
    {
      id: "returningCustomer",
      title: "Cliente ja encontrado",
      subtitle: "Retomada limpa",
      description: "Mensagem usada quando o telefone ja foi reconhecido e a conversa pode seguir rapido.",
      tone: "blue",
      messageField: "returningCustomerMessage",
      buttonsField: "returningCustomerButtons",
      messageText: String(config.returningCustomerMessage || ""),
      previewText: returningPreview.text,
      fallbackText: returningPreview.fallback,
      buttons: config.returningCustomerButtons,
      enabled: true,
      editableMessage: true,
      editableButtons: true,
      helper: `${config.returningCustomerButtons.length} botoes para cliente ja conhecido.`,
      statusNote: "Retoma contexto com linguagem operacional.",
    },
    {
      id: "nameConfirmation",
      title: "Confirmar nome",
      subtitle: "Pergunta simples",
      description: "Se o nome ainda nao estiver confirmado, o motor pergunta como deve chamar o cliente e salva a resposta.",
      tone: "green",
      messageField: null,
      buttonsField: null,
      messageText: "Oi, tudo bem? Antes de continuar, como posso te chamar?",
      previewText: "Oi, tudo bem? Antes de continuar, como posso te chamar?",
      fallbackText: "Oi, tudo bem? Antes de continuar, como posso te chamar?",
      buttons: [],
      enabled: true,
      editableMessage: false,
      editableButtons: false,
      helper: "Depois da confirmacao, o nome fica salvo e o cliente segue para o menu principal.",
      statusNote: "Pergunta reaproveitada do fluxo atual em backend.",
      lockedNote:
        "A confirmacao de nome ja esta implementada no motor do Atendimento. Aqui ela aparece como bloco operacional visivel para o time.",
    },
    {
      id: "mainMenu",
      title: "Menu principal",
      subtitle: "Escolha do cliente",
      description: "Menu operacional principal com saidas claras para agenda, financeiro, humano ou continuidade.",
      tone: "teal",
      messageField: "mainMenuPrompt",
      buttonsField: "mainMenuButtons",
      messageText: String(config.mainMenuPrompt || ""),
      previewText: mainMenuPreview.text,
      fallbackText: mainMenuPreview.fallback,
      buttons: config.mainMenuButtons,
      enabled: true,
      editableMessage: true,
      editableButtons: true,
      helper: `${config.mainMenuButtons.length} botoes ativos no menu principal.`,
      statusNote: "Bloco central da operacao QR-first.",
    },
    {
      id: "recovery",
      title: "Financeiro / recovery detectado",
      subtitle: "Contexto condicional",
      description: "Mostra o ramo financeiro dentro do mesmo produto, sem criar um segundo editor paralelo.",
      tone: "orange",
      messageField: "recoveryDetectedMessage",
      buttonsField: "recoveryDetectedButtons",
      messageText: String(config.recoveryDetectedMessage || ""),
      previewText: recoveryPreview.text,
      fallbackText: recoveryPreview.fallback,
      buttons: config.recoveryDetectedButtons,
      enabled: financeEnabled,
      editableMessage: true,
      editableButtons: true,
      helper: `${config.recoveryDetectedButtons.length} botoes para tratar debito ou humano.`,
      statusNote: financeEnabled ? "Parede financeira ativa." : "Parede financeira desligada.",
      toggle: {
        key: "finance",
        label: "Ativar parede financeira",
        description: "Quando ligada, o inbound pode abrir o contexto financeiro antes do menu principal.",
        active: financeEnabled,
      },
    },
    {
      id: "agenda",
      title: "Agenda",
      subtitle: "Retorno ao fluxo",
      description: "Depois da agenda ou de acoes operacionais, o bot retoma por aqui para manter a conversa organizada.",
      tone: "blue",
      messageField: "postActionPrompt",
      buttonsField: "postActionButtons",
      messageText: String(config.postActionPrompt || ""),
      previewText: postActionPreview.text,
      fallbackText: postActionPreview.fallback,
      buttons: config.postActionButtons,
      enabled: agendaCount > 0 || hasAgendaRoute(config),
      editableMessage: true,
      editableButtons: true,
      helper:
        agendaCount > 0
          ? `${agendaCount} agenda(s) ativa(s) prontas para usar dentro do fluxo.`
          : "Nenhuma agenda ativa encontrada. O bloco continua representando a retomada do atendimento.",
      statusNote: "Continuidade apos agenda ou acao operacional.",
    },
    {
      id: "humanHandoff",
      title: "Passar para humano",
      subtitle: "Fila com contexto",
      description: "Mensagem de confirmacao para a passagem do bot para atendimento humano.",
      tone: "red",
      messageField: "humanAckMessage",
      buttonsField: null,
      messageText: String(config.humanAckMessage || ""),
      previewText: humanPreview.text,
      fallbackText: humanPreview.fallback,
      buttons: [],
      enabled: humanRouteEnabled,
      editableMessage: true,
      editableButtons: false,
      helper: humanRouteEnabled
        ? "Handoff humano visivel no fluxo atual."
        : "Sem saida humana visivel em botoes do fluxo.",
      statusNote: "Historico, telefone e nome seguem para o humano.",
    },
    {
      id: "closing",
      title: "Encerramento",
      subtitle: "Saida limpa",
      description: "Mensagem final usada quando o assunto precisa ser encerrado sem ruido.",
      tone: "slate",
      messageField: "closeTopicMessage",
      buttonsField: null,
      messageText: String(config.closeTopicMessage || ""),
      previewText: closePreview.text,
      fallbackText: closePreview.fallback,
      buttons: [],
      enabled: true,
      editableMessage: true,
      editableButtons: false,
      helper: "Encerramento operacional claro, sem parecer disparo automatico.",
      statusNote: "Fecha a conversa e libera a retomada futura pelo mesmo canal.",
    },
    {
      id: "botOff",
      title: "BOT_OFF",
      subtitle: "Humano assume tudo",
      description: "Quando o BOT_OFF esta ativo, o bot nao responde e a conversa vai direto para operacao humana.",
      tone: "slate",
      messageField: "blockedMessage",
      buttonsField: null,
      messageText: String(config.blockedMessage || ""),
      previewText: blockedPreview.text,
      fallbackText: blockedPreview.fallback,
      buttons: [],
      enabled: !config.routingRules.globalBotEnabled,
      editableMessage: true,
      editableButtons: false,
      helper: config.routingRules.globalBotEnabled
        ? "Automacao ligada. BOT_OFF global esta desligado."
        : "BOT_OFF global ligado. Nao existe resposta automatica ativa.",
      statusNote: "Persistido na configuracao atual do Atendimento.",
      toggle: {
        key: "bot",
        label: "BOT_OFF persistente",
        description: "Desliga a automacao global e deixa a operacao seguir apenas com humano.",
        active: !config.routingRules.globalBotEnabled,
      },
    },
  ] satisfies BotQrEditorBlock[];
}

export function buildScenarioPreview(
  config: AtendimentoBotConfig,
  scenarioId: BotQrPreviewScenarioId,
): BotQrPreviewMessage[] {
  const samples = {
    cliente: "Rafaela",
    empresa: "HBX Prime",
    funcionario: "Time HBX",
    valor_formatado: "R$ 480,00",
    agenda_nome: "Instalacao tecnica",
    agenda_slots: "Qui 14:00",
  };

  if (scenarioId === "known_customer") {
    return [
      {
        id: "known-customer-inbound",
        role: "customer",
        label: "Cliente",
        text: "Voltei para continuar o atendimento do mesmo numero.",
      },
      {
        id: "known-customer-bot",
        role: "bot",
        label: "Bot QR",
        text: renderConfigText(config.returningCustomerMessage, config, samples),
        buttons: (config.returningCustomerButtons || []).map((button) => button.title),
      },
    ];
  }

  if (scenarioId === "debt_customer") {
    return [
      {
        id: "debt-inbound",
        role: "customer",
        label: "Cliente",
        text: "Quero resolver o valor pendente agora.",
      },
      {
        id: "debt-bot",
        role: "bot",
        label: "Bot QR",
        text: renderConfigText(config.recoveryDetectedMessage, config, samples),
        buttons: (config.recoveryDetectedButtons || []).map((button) => button.title),
      },
    ];
  }

  if (scenarioId === "human_handoff") {
    return [
      {
        id: "human-inbound",
        role: "customer",
        label: "Cliente",
        text: "Prefiro falar com uma pessoa agora.",
      },
      {
        id: "human-bot",
        role: "bot",
        label: "Bot QR",
        text: renderConfigText(config.humanAckMessage, config, samples),
      },
      {
        id: "human-agent",
        role: "agent",
        label: "Fila humana",
        text: "Nome, telefone e historico seguem para o humano sem perder o contexto anterior.",
      },
    ];
  }

  if (scenarioId === "bot_off") {
    return [
      {
        id: "bot-off-inbound",
        role: "customer",
        label: "Cliente",
        text: "Oi, cheguei pelo QR. Tem alguem ai?",
      },
      {
        id: "bot-off-system",
        role: "system",
        label: "BOT_OFF",
        text: "Nenhuma resposta automatica foi enviada. A conversa segue direto para humano.",
        subtle: true,
      },
      {
        id: "bot-off-agent",
        role: "agent",
        label: "Operacao",
        text: "Fila humana pronta para assumir com o mesmo historico do cliente.",
      },
    ];
  }

  if (scenarioId === "name_confirmation") {
    return [
      {
        id: "name-inbound",
        role: "customer",
        label: "Cliente",
        text: "Oi, quero continuar pelo QR.",
      },
      {
        id: "name-question",
        role: "bot",
        label: "Bot QR",
        text: "Oi, tudo bem? Antes de continuar, como posso te chamar?",
      },
      {
        id: "name-answer",
        role: "customer",
        label: "Cliente",
        text: "Joao Mendes.",
      },
      {
        id: "name-success",
        role: "bot",
        label: "Bot QR",
        text: "Cadastro realizado com sucesso. Podemos continuar seu atendimento.",
        buttons: (config.mainMenuButtons || []).map((button) => button.title),
      },
    ];
  }

  return [
    {
      id: "new-customer-inbound",
      role: "customer",
      label: "Cliente",
      text: "Acabei de escanear o QR e preciso de atendimento.",
    },
    {
      id: "new-customer-bot",
      role: "bot",
      label: "Bot QR",
      text: renderConfigText(config.welcomeMessage, config, samples),
      buttons: (config.welcomeButtons || []).map((button) => button.title),
    },
  ];
}
