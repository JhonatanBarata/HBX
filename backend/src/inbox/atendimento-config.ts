export const ATENDIMENTO_BOT_CONFIG_CHANNEL = '__ATENDIMENTO_BOT_CONFIG__';
export const ATENDIMENTO_BOT_CONFIG_TITLE = 'config_v1';

export const ATENDIMENTO_AGENDA_CONFIG_CHANNEL = '__ATENDIMENTO_AGENDA_CONFIG__';
export const ATENDIMENTO_AGENDA_CONFIG_TITLE = 'config_v1';

export const ATENDIMENTO_BUTTON_ID_PREFIX = 'atendimento_';

export const ATENDIMENTO_BOT_ACTION_IDS = [
  'start_quick_registration',
  'continue_journey',
  'talk_human',
  'close_topic',
  'enter_recovery',
  'show_main_menu',
  'schedule_service',
  'reschedule_service',
  'cancel_appointment',
  'technical_support',
  'talk_owner',
  'supplier_contact',
  'personal_subject',
] as const;

export type AtendimentoBotActionId = (typeof ATENDIMENTO_BOT_ACTION_IDS)[number];
export type AtendimentoBotAnyActionId = AtendimentoBotActionId | string;

export type ChannelProvider = 'evolution' | 'meta';

export type ProviderCapabilities = {
  provider: ChannelProvider;
  canUseTemplates: boolean;
  canUseOfficialButtons: boolean;
  canUseRecoveryTemplates: boolean;
  canUseAgendaBot: boolean;
};

export const EVOLUTION_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  provider: 'evolution',
  canUseTemplates: false,
  canUseOfficialButtons: false,
  canUseRecoveryTemplates: false,
  canUseAgendaBot: true,
};

export const META_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  provider: 'meta',
  canUseTemplates: true,
  canUseOfficialButtons: true,
  canUseRecoveryTemplates: true,
  canUseAgendaBot: true,
};

export const META_TEMPLATES_REQUIRED_MESSAGE =
  'Templates oficiais exigem Meta WhatsApp Oficial.';

export const ATENDIMENTO_RECOVERY_ACTION_IDS = [
  'enter_recovery',
  'view_payments',
  'pay_now',
  'negotiate_debt',
  'continue_attendance',
] as const;

export type AtendimentoBotVariableScope = 'shared' | 'atendimento' | 'recovery';

export type AtendimentoBotVariableDefinition = {
  key: string;
  label: string;
  example: string;
  description: string;
  scope: AtendimentoBotVariableScope;
  required: boolean;
};

export type AtendimentoBotActionKind =
  | 'reply'
  | 'human_handoff'
  | 'recovery_handoff'
  | 'close'
  | 'show_menu'
  | 'agenda';

export type AtendimentoBotActionGuide = {
  actionId: AtendimentoBotAnyActionId;
  title: string;
  description: string;
  route: AtendimentoBotVariableScope;
  kind: AtendimentoBotActionKind;
  enabled: boolean;
  responseMessage?: string;
  agendaGroupId?: string | null;
  custom?: boolean;
};

export type AtendimentoBotButton = {
  buttonId: string;
  actionId: AtendimentoBotAnyActionId;
  title: string;
  nextNodeId?: string;
};

export type AtendimentoRoutingRules = {
  globalBotEnabled: boolean;
  checkRecoveryBeforeReply: boolean;
  autoRouteDebtorsToRecovery: boolean;
  autoReopenClosedConversation: boolean;
  notifyOnNewInbound: boolean;
};

export type AtendimentoBotType =
  | 'vendas'
  | 'atendimento'
  | 'organizacao'
  | 'recovery'
  | 'prospeccao';

export type AtendimentoBotSetup = {
  completed: boolean;
  completedAt?: string | null;
  botType?: AtendimentoBotType | null;
  channelMode?: 'QR' | 'OFFICIAL' | null;
  provider?: ChannelProvider | null;
  configuredFrom?: string | null;
};

export type AtendimentoSmartGreetingConfig = {
  timezone?: string;
  morning?: string;
  afternoon?: string;
  night?: string;
  morningStartHour?: number;
  afternoonStartHour?: number;
  nightStartHour?: number;
};

export type AtendimentoSmartVariablesConfig = {
  greeting?: AtendimentoSmartGreetingConfig;
};

export type AtendimentoSceneRule = {
  sceneId: string;
  conditionType: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
};

export type AtendimentoBotConfig = {
  setup: AtendimentoBotSetup;
  variableCatalog: AtendimentoBotVariableDefinition[];
  actionCatalog: AtendimentoBotActionGuide[];
  routingRules: AtendimentoRoutingRules;
  smartVariables?: AtendimentoSmartVariablesConfig;
  sceneRules?: AtendimentoSceneRule[];
  welcomeButtons: AtendimentoBotButton[];
  returningCustomerButtons: AtendimentoBotButton[];
  mainMenuPrompt: string;
  mainMenuButtons: AtendimentoBotButton[];
  welcomeMessage: string;
  returningCustomerMessage: string;
  recoveryDetectedMessage: string;
  recoveryDetectedButtons: AtendimentoBotButton[];
  postActionPrompt: string;
  postActionButtons: AtendimentoBotButton[];
  humanAckMessage: string;
  closeTopicMessage: string;
  blockedMessage: string;
};

export type AtendimentoAgendaSlot = {
  id: string;
  label: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
};

export type AtendimentoAgendaConnectionStatus = 'not_linked' | 'pending' | 'connected';

export type AtendimentoAgendaGuideActionType =
  | 'abrir_agenda'
  | 'cancelar_agendamento'
  | 'acao_customizada';

export type AtendimentoAgendaSendType = 'botoes' | 'lista';

export type AtendimentoAgendaInitialMessage = {
  greeting: string;
  companyLabel: string;
  attendantLabel: string;
  introText: string;
  sendType: AtendimentoAgendaSendType;
  fallbackText: string;
};

export type AtendimentoAgendaFlowMessages = {
  availabilityIntro: string;
  fallbackFutureSlots: string;
  confirmationMessage: string;
  cancellationPrompt: string;
  cancellationSuccess: string;
  cancellationNotFound: string;
};

export type AtendimentoAgendaGroup = {
  id: string;
  slug: string;
  title: string;
  description: string;
  buttonLabel: string;
  actionType: AtendimentoAgendaGuideActionType;
  linkedAgendaId: string;
  customActionKey?: string | null;
  sortOrder: number;
  introMessage: string;
  emptyMessage: string;
  linkedEmail: string;
  linkedUserName: string;
  connectionStatus: AtendimentoAgendaConnectionStatus;
  accentColor: string;
  isActive: boolean;
  workdays: number[];
  visibleBusinessDays: number;
  searchWindowDays: number;
  suggestedSlotsCount: number;
  fallbackFutureSlotsCount: number;
  noImmediateAvailabilityMessage: string;
  simpleMode?: boolean;
  capacityPerDay?: number;
  reminderMinutes?: number;
  slots: AtendimentoAgendaSlot[];
};

export type AtendimentoAgendaConfig = {
  timezone: string;
  initialMessage: AtendimentoAgendaInitialMessage;
  flowMessages: AtendimentoAgendaFlowMessages;
  groups: AtendimentoAgendaGroup[];
  holidays: string[];
};

const DEFAULT_VARIABLE_CATALOG: AtendimentoBotVariableDefinition[] = [
  {
    key: 'cumprimentacao',
    label: 'Cumprimentacao',
    example: 'Bom dia',
    description: 'Saudacao inteligente resolvida pelo horario local do atendimento.',
    scope: 'shared',
    required: false,
  },
  {
    key: 'cliente',
    label: 'Nome do cliente',
    example: 'Maria Oliveira',
    description: 'Nome mostrado nas mensagens do Atendimento e nos atalhos do bot.',
    scope: 'shared',
    required: true,
  },
  {
    key: 'empresa',
    label: 'Nome da empresa',
    example: 'Colsani Ar Condicionado',
    description: 'Empresa logada no tenant atual.',
    scope: 'shared',
    required: true,
  },
  {
    key: 'funcionario',
    label: 'Atendente responsavel',
    example: 'Leo Colsani',
    description: 'Nome do operador quando a conversa passa para humano.',
    scope: 'atendimento',
    required: false,
  },
  {
    key: 'valor_formatado',
    label: 'Valor em aberto',
    example: 'R$ 480,00',
    description: 'Valor recuperado do cadastro do Recovery quando existir debito.',
    scope: 'recovery',
    required: false,
  },
  {
    key: 'agenda_nome',
    label: 'Nome da agenda',
    example: 'Tecnicos',
    description: 'Nome da guia/agenda escolhida no agendamento.',
    scope: 'atendimento',
    required: false,
  },
  {
    key: 'agenda_slots',
    label: 'Horarios disponiveis',
    example: 'Seg 09:00-11:00 | Qua 14:00-18:00',
    description: 'Lista renderizada com os proximos horarios disponiveis.',
    scope: 'atendimento',
    required: false,
  },
];

export const DEFAULT_ATENDIMENTO_SMART_VARIABLES: AtendimentoSmartVariablesConfig = {
  greeting: {
    timezone: 'America/Sao_Paulo',
    morning: 'Bom dia',
    afternoon: 'Boa tarde',
    night: 'Boa noite',
    morningStartHour: 3,
    afternoonStartHour: 12,
    nightStartHour: 18,
  },
};

const DEFAULT_ACTION_CATALOG: AtendimentoBotActionGuide[] = [
  {
    actionId: 'start_quick_registration',
    title: 'Iniciar cadastro rapido',
    description: 'Abre a coleta inicial de dados para um novo cliente sem depender de texto livre.',
    route: 'atendimento',
    kind: 'reply',
    enabled: true,
    responseMessage:
      'Perfeito. Vamos iniciar seu cadastro rapido agora. Me envie seu nome completo para eu abrir a ficha inicial.',
  },
  {
    actionId: 'continue_journey',
    title: 'Continuar atendimento',
    description: 'Mantem o cliente dentro da jornada principal do Atendimento.',
    route: 'atendimento',
    kind: 'show_menu',
    enabled: true,
  },
  {
    actionId: 'talk_human',
    title: 'Falar com atendente',
    description: 'Encaminha a conversa para a fila humana do Atendimento.',
    route: 'atendimento',
    kind: 'human_handoff',
    enabled: true,
  },
  {
    actionId: 'close_topic',
    title: 'Encerrar conversa',
    description: 'Fecha a conversa sem manter o bot ativo.',
    route: 'shared',
    kind: 'close',
    enabled: true,
  },
  {
    actionId: 'enter_recovery',
    title: 'Abrir contexto financeiro',
    description: 'Leva o cliente para o resumo financeiro dentro do fluxo principal do Atendimento.',
    route: 'recovery',
    kind: 'recovery_handoff',
    enabled: true,
  },
  {
    actionId: 'show_main_menu',
    title: 'Mostrar menu principal',
    description: 'Reabre o menu principal do Atendimento.',
    route: 'atendimento',
    kind: 'show_menu',
    enabled: true,
  },
  {
    actionId: 'view_payments',
    title: 'Ver pagamentos',
    description: 'Mostra pagamentos recentes e historico financeiro do cliente.',
    route: 'recovery',
    kind: 'reply',
    enabled: true,
    responseMessage: 'Vou abrir o historico de pagamentos e continuar por aqui com voce.',
  },
  {
    actionId: 'pay_now',
    title: 'Pagar agora',
    description: 'Gera link ou dispara a proxima acao financeira imediata.',
    route: 'recovery',
    kind: 'reply',
    enabled: true,
    responseMessage: 'Perfeito. Vou gerar a acao financeira para voce seguir agora.',
  },
  {
    actionId: 'negotiate_debt',
    title: 'Negociar',
    description: 'Registra uma negociacao sem tirar o cliente do fluxo principal.',
    route: 'recovery',
    kind: 'reply',
    enabled: true,
    responseMessage: 'Vamos registrar uma negociacao e seguir pelo melhor caminho para o seu caso.',
  },
  {
    actionId: 'continue_attendance',
    title: 'Continuar atendimento',
    description: 'Sai do contexto financeiro e devolve a conversa para a triagem principal.',
    route: 'atendimento',
    kind: 'show_menu',
    enabled: true,
  },
  {
    actionId: 'schedule_service',
    title: 'Agendar com Glauco',
    description: 'Mostra os proximos dias livres da agenda simples do responsavel.',
    route: 'atendimento',
    kind: 'agenda',
    enabled: true,
    agendaGroupId: 'agenda_glauco',
  },
  {
    actionId: 'reschedule_service',
    title: 'Reagendar atendimento',
    description: 'Permite reagendar apenas quando existe agendamento futuro confirmado.',
    route: 'atendimento',
    kind: 'agenda',
    enabled: true,
    agendaGroupId: 'agenda_glauco',
  },
  {
    actionId: 'cancel_appointment',
    title: 'Cancelar agendamento',
    description: 'Cancela apenas agendamento futuro confirmado.',
    route: 'atendimento',
    kind: 'agenda',
    enabled: true,
    agendaGroupId: 'agenda_glauco',
  },
  {
    actionId: 'technical_support',
    title: 'Suporte tecnico',
    description: 'Mantem a conversa no Atendimento para coleta basica do problema.',
    route: 'atendimento',
    kind: 'reply',
    enabled: true,
    responseMessage: 'Certo. Me conte em poucas palavras o que esta acontecendo para eu direcionar o suporte tecnico.',
  },
  {
    actionId: 'talk_owner',
    title: 'Falar direto com Glauco',
    description: 'Pausa o bot e deixa a conversa aberta para o responsavel responder.',
    route: 'atendimento',
    kind: 'human_handoff',
    enabled: true,
  },
  {
    actionId: 'supplier_contact',
    title: 'Fornecedor / parceria',
    description: 'Pausa o bot e deixa a conversa para avaliacao humana sem enviar para Vendas.',
    route: 'atendimento',
    kind: 'human_handoff',
    enabled: true,
  },
  {
    actionId: 'personal_subject',
    title: 'Assunto pessoal',
    description: 'Marca o contato como pessoal e protege a conversa contra respostas do bot.',
    route: 'atendimento',
    kind: 'human_handoff',
    enabled: true,
  },
];

function normalizeButtonId(value: unknown, fallback: string) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_:-]/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

function buildDefaultButtonId(sectionKey: string, actionId: string, index: number) {
  return normalizeButtonId(`${sectionKey}_${actionId || 'action'}_${index + 1}`, `${sectionKey}_${index + 1}`);
}

function resolveDefaultAtendimentoNextNodeId(actionIdRaw: string | null | undefined) {
  const actionId = String(actionIdRaw || '').trim().toLowerCase();
  switch (actionId) {
    case 'talk_human':
      return 'humanAckMessage';
    case 'close_topic':
      return 'closeTopicMessage';
    case 'show_main_menu':
      return 'mainMenuPrompt';
    case 'enter_recovery':
      return 'recoveryDetectedMessage';
    case 'start_quick_registration':
      return 'registrationCapture';
    case 'view_payments':
      return 'paymentHistory';
    case 'pay_now':
      return 'paymentAction';
    case 'negotiate_debt':
      return 'negotiationAction';
    case 'continue_attendance':
      return 'mainMenuPrompt';
    case 'schedule_service':
      return 'agendaDispatch';
    default:
      if (actionId.startsWith('agenda:')) return 'agendaDispatch';
      return 'postActionPrompt';
  }
}

function normalizeNextNodeId(value: unknown, actionId: string) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_:-]/g, '')
    .slice(0, 80);
  return normalized || resolveDefaultAtendimentoNextNodeId(actionId);
}

function makeDefaultButton(
  sectionKey: string,
  actionId: AtendimentoBotAnyActionId,
  title: string,
  index: number,
): AtendimentoBotButton {
  return {
    buttonId: buildDefaultButtonId(sectionKey, String(actionId || ''), index),
    actionId,
    title,
    nextNodeId: resolveDefaultAtendimentoNextNodeId(String(actionId || '')),
  };
}

const DEFAULT_FIRST_CONTACT_SCENE_RULES: AtendimentoSceneRule[] = [
  {
    sceneId: 'first_contact_rules_atendimento',
    conditionType: 'first_contact_rules',
    enabled: true,
    metadata: {
      guideId: 'atendimento',
      canInitiateConversation: false,
      messageIntervalSeconds: 18,
      nextContactDelayMinutes: 0,
      replyDelaySeconds: 22,
      typingSeconds: 5,
      typingVarianceSeconds: 4,
      maxFirstContactsPerHour: 0,
      quietHoursStart: '20:00',
      quietHoursEnd: '08:00',
      maxFollowUps: 1,
      followUpDelayHours: 6,
      requireOptIn: false,
      stopIntentKeywords: ['parar', 'bloquear', 'atendente', 'reclamacao'],
      positiveIntentKeywords: ['suporte', 'agenda', 'financeiro', 'ajuda'],
      optOutMessage: 'Sem problema. Vou encerrar por aqui e deixo um atendente assumir se voce precisar.',
      handoffPolicy: 'Se houver reclamacao, audio confuso ou pedido de humano, pausa o bot e coloca na fila Atendimento.',
    },
  },
  {
    sceneId: 'first_contact_rules_prospeccao',
    conditionType: 'first_contact_rules',
    enabled: true,
    metadata: {
      guideId: 'prospeccao',
      canInitiateConversation: true,
      messageIntervalSeconds: 35,
      nextContactDelayMinutes: 12,
      replyDelaySeconds: 75,
      typingSeconds: 8,
      typingVarianceSeconds: 6,
      maxFirstContactsPerHour: 5,
      quietHoursStart: '18:30',
      quietHoursEnd: '09:00',
      maxFollowUps: 2,
      followUpDelayHours: 24,
      requireOptIn: false,
      stopIntentKeywords: ['nao tenho interesse', 'nao quero', 'pare', 'remover', 'spam'],
      positiveIntentKeywords: ['tenho interesse', 'pode mandar', 'quero saber', 'me explica', 'quanto custa'],
      optOutMessage: 'Tudo bem, obrigado por responder. Nao vou insistir e encerro este contato por aqui.',
      handoffPolicy: 'Se a pessoa demonstrar irritacao, pedir remocao ou responder negativamente duas vezes, encerra sem nova tentativa.',
    },
  },
  {
    sceneId: 'first_contact_rules_recovery',
    conditionType: 'first_contact_rules',
    enabled: true,
    metadata: {
      guideId: 'recovery',
      canInitiateConversation: true,
      messageIntervalSeconds: 45,
      nextContactDelayMinutes: 8,
      replyDelaySeconds: 60,
      typingSeconds: 7,
      typingVarianceSeconds: 5,
      maxFirstContactsPerHour: 6,
      quietHoursStart: '19:00',
      quietHoursEnd: '09:00',
      maxFollowUps: 3,
      followUpDelayHours: 24,
      requireOptIn: true,
      stopIntentKeywords: ['nao reconheco', 'ja paguei', 'contestacao', 'atendente', 'pare'],
      positiveIntentKeywords: ['pagar', 'pix', 'boleto', 'parcelar', 'negociar'],
      optOutMessage: 'Entendi. Vou pausar a cobranca automatica e deixar o atendimento humano verificar com cuidado.',
      handoffPolicy: 'Contestacao, pagamento informado, tom irritado ou duvida sobre valor vai direto para humano antes de novo disparo.',
    },
  },
];

export const DEFAULT_ATENDIMENTO_BOT_CONFIG: AtendimentoBotConfig = {
  setup: {
    completed: false,
    completedAt: null,
    botType: null,
    channelMode: null,
    provider: null,
    configuredFrom: null,
  },
  variableCatalog: DEFAULT_VARIABLE_CATALOG,
  actionCatalog: DEFAULT_ACTION_CATALOG,
  routingRules: {
    globalBotEnabled: false,
    checkRecoveryBeforeReply: true,
    autoRouteDebtorsToRecovery: true,
    autoReopenClosedConversation: true,
    notifyOnNewInbound: true,
  },
  smartVariables: DEFAULT_ATENDIMENTO_SMART_VARIABLES,
  sceneRules: DEFAULT_FIRST_CONTACT_SCENE_RULES,
  welcomeMessage:
    'Ola, tudo bem?\nSou o atendimento da {{empresa}} e vou concluir seu cadastro rapido antes de seguir com a triagem principal.',
  welcomeButtons: [
    makeDefaultButton('welcome_message', 'continue_journey', 'Continuar atendimento', 0),
    makeDefaultButton('welcome_message', 'talk_human', 'Falar com atendente', 1),
  ],
  returningCustomerMessage:
    'Que bom te ver de novo, {{cliente}}. Vou continuar daqui e te mostrar o melhor caminho no Atendimento.',
  returningCustomerButtons: [
    makeDefaultButton('returning_customer', 'continue_journey', 'Continuar', 0),
    makeDefaultButton('returning_customer', 'talk_human', 'Falar com atendente', 1),
  ],
  mainMenuPrompt: '{{cumprimentacao}}! Sou o assistente da {{empresa}}.\nComo posso te ajudar?',
  mainMenuButtons: [
    makeDefaultButton('main_menu', 'schedule_service', 'Agendar com Glauco', 0),
    makeDefaultButton('main_menu', 'technical_support', 'Suporte tecnico', 1),
    makeDefaultButton('main_menu', 'talk_owner', 'Falar direto com Glauco', 2),
    makeDefaultButton('main_menu', 'supplier_contact', 'Fornecedor / parceria', 3),
    makeDefaultButton('main_menu', 'personal_subject', 'Assunto pessoal', 4),
  ],
  recoveryDetectedMessage:
    'Encontrei um valor pendente de {{valor_formatado}}. Posso te mostrar pagamentos, seguir com uma acao financeira ou continuar no Atendimento sem perder o contexto.',
  recoveryDetectedButtons: [
    makeDefaultButton('recovery_detected', 'view_payments', 'Ver pagamentos', 0),
    makeDefaultButton('recovery_detected', 'pay_now', 'Pagar agora', 1),
    makeDefaultButton('recovery_detected', 'negotiate_debt', 'Negociar', 2),
    makeDefaultButton('recovery_detected', 'continue_attendance', 'Continuar atendimento', 3),
    makeDefaultButton('recovery_detected', 'talk_human', 'Falar com atendente', 4),
    makeDefaultButton('recovery_detected', 'schedule_service', 'Agendar visita', 5),
  ],
  postActionPrompt: 'Se precisar, posso continuar pelo Atendimento, voltar ao financeiro ou encaminhar para agenda e humano.',
  postActionButtons: [
    makeDefaultButton('post_action', 'show_main_menu', 'Voltar ao menu', 0),
    makeDefaultButton('post_action', 'talk_human', 'Atendimento humano', 1),
  ],
  humanAckMessage: 'Perfeito. Vou encaminhar sua conversa para um atendente agora.',
  closeTopicMessage: 'Entendido. Vou encerrar esta conversa por agora. Quando precisar, e so chamar.',
  blockedMessage: 'Este contato esta bloqueado no Atendimento.',
};

const DEFAULT_BOT_AGENDA_GROUP: AtendimentoAgendaGroup = {
  id: 'agenda_glauco',
  slug: 'glauco',
  title: 'Glauco',
  description: 'Agenda simples para atendimento direto com Glauco.',
  buttonLabel: 'Agendar com Glauco',
  actionType: 'abrir_agenda',
  linkedAgendaId: 'agenda_glauco',
  customActionKey: null,
  sortOrder: 0,
  introMessage:
    'Tenho estas opções para falar com o Glauco:\n\n{{agenda_slots}}\n\nResponda com o número da melhor opção.',
  emptyMessage: 'Não encontrei horário livre nos próximos dias. Vou deixar essa conversa para o Glauco ajustar manualmente.',
  linkedEmail: '',
  linkedUserName: 'Glauco',
  connectionStatus: 'not_linked',
  accentColor: '#4da36f',
  isActive: true,
  workdays: [1, 2, 3, 4, 5],
  visibleBusinessDays: 5,
  searchWindowDays: 14,
  suggestedSlotsCount: 5,
  fallbackFutureSlotsCount: 3,
  noImmediateAvailabilityMessage:
    'Não encontrei horário livre nos próximos dias. Vou deixar essa conversa para o Glauco ajustar manualmente.',
  simpleMode: true,
  capacityPerDay: 1,
  reminderMinutes: 60,
  slots: [
    {
      id: 'agenda_glauco_0900_1300',
      label: '09:00 às 13:00',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '13:00',
      enabled: true,
    },
  ],
};

export const DEFAULT_ATENDIMENTO_AGENDA_CONFIG: AtendimentoAgendaConfig = {
  timezone: 'America/Sao_Paulo',
  initialMessage: {
    greeting: 'Ola! Tudo bem?',
    companyLabel: '{{empresa}}',
    attendantLabel: '{{funcionario}}',
    introText:
      'Escolha abaixo a guia que faz mais sentido para o seu atendimento e eu vou sugerir os horarios disponiveis.',
    sendType: 'botoes',
    fallbackText:
      'Se nenhuma guia fizer sentido agora, responda esta mensagem e um atendente continua por aqui.',
  },
  flowMessages: {
    availabilityIntro:
      'Esses sao os horarios que encontrei para {{agenda_nome}}. Escolha uma opcao para confirmar.',
    fallbackFutureSlots:
      'Nao encontrei horario imediato. Posso te oferecer as proximas opcoes futuras desta guia.',
    confirmationMessage:
      'Agendamento confirmado para {{agenda_nome}} em {{agenda_slots}}. Se precisar, voce pode cancelar pela propria jornada.',
    cancellationPrompt:
      'Localizei um agendamento ativo para {{agenda_nome}} em {{agenda_slots}}. Deseja cancelar agora?',
    cancellationSuccess:
      'Pronto. O agendamento de {{agenda_nome}} foi cancelado com sucesso.',
    cancellationNotFound:
      'Nao encontrei agendamento ativo para este cliente. Se quiser, posso te mostrar novas opcoes de horario.',
  },
  groups: [DEFAULT_BOT_AGENDA_GROUP],
  holidays: [],
};

const LEGACY_ATENDIMENTO_AGENDA_GROUPS: AtendimentoAgendaGroup[] = [
    {
      id: 'agenda_tecnicos',
      slug: 'tecnicos',
      title: 'Tecnicos',
      description: 'Horarios de manutencao e visitas tecnicas.',
      buttonLabel: 'Tecnicos',
      actionType: 'abrir_agenda',
      linkedAgendaId: 'agenda_tecnicos',
      customActionKey: null,
      sortOrder: 0,
      introMessage:
        'Esses sao os horarios disponiveis para {{agenda_nome}}. Se quiser, um atendente pode confirmar o melhor encaixe.',
      emptyMessage: 'No momento nao ha horarios ativos para essa agenda.',
      linkedEmail: '',
      linkedUserName: '',
      connectionStatus: 'not_linked',
      accentColor: '#4da36f',
      isActive: true,
      workdays: [1, 2, 3, 4, 5],
      visibleBusinessDays: 7,
      searchWindowDays: 7,
      suggestedSlotsCount: 3,
      fallbackFutureSlotsCount: 3,
      noImmediateAvailabilityMessage:
        'Nao encontrei disponibilidade imediata para esta guia. Vou priorizar os proximos horarios futuros.',
      slots: [
        {
          id: 'agenda_tecnicos_seg_0900',
          label: 'Segunda 09:00-11:00',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '11:00',
          enabled: true,
        },
        {
          id: 'agenda_tecnicos_qua_1400',
          label: 'Quarta 14:00-18:00',
          dayOfWeek: 3,
          startTime: '14:00',
          endTime: '18:00',
          enabled: true,
        },
      ],
    },
    {
      id: 'agenda_gerencia',
      slug: 'gerencia',
      title: 'Gerencia',
      description: 'Espacos de alinhamento, aprovacao e retorno executivo.',
      buttonLabel: 'Gerencia',
      actionType: 'abrir_agenda',
      linkedAgendaId: 'agenda_gerencia',
      customActionKey: null,
      sortOrder: 1,
      introMessage:
        'Essas sao as janelas abertas para {{agenda_nome}}. Escolha a melhor opcao e eu sigo com a confirmacao.',
      emptyMessage: 'A gerencia nao abriu novos horarios nesta semana.',
      linkedEmail: '',
      linkedUserName: '',
      connectionStatus: 'not_linked',
      accentColor: '#5d83ff',
      isActive: true,
      workdays: [1, 2, 3, 4, 5],
      visibleBusinessDays: 7,
      searchWindowDays: 7,
      suggestedSlotsCount: 3,
      fallbackFutureSlotsCount: 3,
      noImmediateAvailabilityMessage:
        'A gerencia nao tem horario imediato. Vou abrir os proximos encaixes futuros para escolha.',
      slots: [
        {
          id: 'agenda_gerencia_ter_1000',
          label: 'Terca 10:00-11:00',
          dayOfWeek: 2,
          startTime: '10:00',
          endTime: '11:00',
          enabled: true,
        },
        {
          id: 'agenda_gerencia_qui_1500',
          label: 'Quinta 15:00-16:30',
          dayOfWeek: 4,
          startTime: '15:00',
          endTime: '16:30',
          enabled: true,
        },
      ],
    },
    {
      id: 'agenda_equipe',
      slug: 'equipe',
      title: 'Equipe',
      description: 'Treinamentos, handoff e distribuicao da operacao.',
      buttonLabel: 'Equipe',
      actionType: 'abrir_agenda',
      linkedAgendaId: 'agenda_equipe',
      customActionKey: null,
      sortOrder: 2,
      introMessage:
        'Esses horarios da {{agenda_nome}} ja estao liberados para atendimento.',
      emptyMessage: 'A equipe ainda nao publicou novas faixas para este fluxo.',
      linkedEmail: '',
      linkedUserName: '',
      connectionStatus: 'not_linked',
      accentColor: '#e57b47',
      isActive: true,
      workdays: [1, 2, 3, 4, 5],
      visibleBusinessDays: 7,
      searchWindowDays: 7,
      suggestedSlotsCount: 3,
      fallbackFutureSlotsCount: 3,
      noImmediateAvailabilityMessage:
        'A equipe nao publicou horario imediato. Vou te mostrar os proximos horarios futuros.',
      slots: [
        {
          id: 'agenda_equipe_seg_0830',
          label: 'Segunda 08:30-09:30',
          dayOfWeek: 1,
          startTime: '08:30',
          endTime: '09:30',
          enabled: true,
        },
        {
          id: 'agenda_equipe_sex_1330',
          label: 'Sexta 13:30-15:00',
          dayOfWeek: 5,
          startTime: '13:30',
          endTime: '15:00',
          enabled: true,
        },
      ],
    },
    {
      id: 'agenda_cancelamento',
      slug: 'cancelar_agendamento',
      title: 'Cancelar agenda',
      description: 'Guia especial para localizar e cancelar agendamentos ativos do cliente.',
      buttonLabel: 'Cancelar agenda',
      actionType: 'cancelar_agendamento',
      linkedAgendaId: 'agenda_cancelamento',
      customActionKey: null,
      sortOrder: 3,
      introMessage:
        'Vou localizar o compromisso atual deste cliente e pedir a confirmacao do cancelamento.',
      emptyMessage: 'Nao encontrei compromisso ativo para cancelar neste momento.',
      linkedEmail: '',
      linkedUserName: '',
      connectionStatus: 'not_linked',
      accentColor: '#d05b42',
      isActive: true,
      workdays: [1, 2, 3, 4, 5],
      visibleBusinessDays: 7,
      searchWindowDays: 14,
      suggestedSlotsCount: 1,
      fallbackFutureSlotsCount: 0,
      noImmediateAvailabilityMessage:
        'Nao foi possivel localizar compromisso imediato para cancelamento.',
      slots: [],
    },
];
void LEGACY_ATENDIMENTO_AGENDA_GROUPS;

function normalizeText(value: unknown, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeRoute(value: unknown): AtendimentoBotVariableScope {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'atendimento') return 'atendimento';
  if (normalized === 'recovery') return 'recovery';
  return 'shared';
}

function normalizeActionKind(value: unknown): AtendimentoBotActionKind {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'human_handoff') return 'human_handoff';
  if (normalized === 'recovery_handoff') return 'recovery_handoff';
  if (normalized === 'close') return 'close';
  if (normalized === 'show_menu') return 'show_menu';
  if (normalized === 'agenda') return 'agenda';
  return 'reply';
}

function normalizeActionId(value: unknown, fallback: string) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_:]/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

function normalizeButtons(value: unknown, fallback: AtendimentoBotButton[], sectionKey: string) {
  if (value === undefined || value === null) {
    return fallback.map((item) => ({ ...item }));
  }
  const items = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const normalized = items
    .map((item, index) => {
      const actionId = normalizeActionId((item as any)?.actionId, '');
      const title = normalizeText((item as any)?.title);
      if (!actionId || !title) return null;
      let buttonId = normalizeButtonId(
        (item as any)?.buttonId,
        buildDefaultButtonId(sectionKey, actionId, index),
      );
      let collisionIndex = 1;
      while (seen.has(buttonId)) {
        buttonId = normalizeButtonId(
          `${buttonId}_${collisionIndex}`,
          buildDefaultButtonId(sectionKey, actionId, index + collisionIndex),
        );
        collisionIndex += 1;
      }
      seen.add(buttonId);
      return {
        buttonId,
        actionId,
        title,
        nextNodeId: normalizeNextNodeId((item as any)?.nextNodeId, actionId),
      };
    })
    .filter(Boolean) as AtendimentoBotButton[];
  return normalized;
}

function normalizeVariableCatalog(value: unknown) {
  const defaults = new Map(DEFAULT_VARIABLE_CATALOG.map((item) => [item.key, { ...item }]));
  const items = Array.isArray(value) ? value : [];
  for (const item of items) {
    const key = normalizeText((item as any)?.key);
    if (!key) continue;
    defaults.set(key, {
      key,
      label: normalizeText((item as any)?.label, defaults.get(key)?.label || key),
      example: normalizeText((item as any)?.example, defaults.get(key)?.example || ''),
      description: normalizeText(
        (item as any)?.description,
        defaults.get(key)?.description || '',
      ),
      scope: normalizeRoute((item as any)?.scope),
      required: Boolean((item as any)?.required ?? defaults.get(key)?.required),
    });
  }
  return Array.from(defaults.values());
}

function normalizeActionCatalog(value: unknown) {
  const defaults = new Map(
    DEFAULT_ACTION_CATALOG.map((item) => [String(item.actionId), { ...item }]),
  );
  const items = Array.isArray(value) ? value : [];
  for (const item of items) {
    const actionId = normalizeActionId(
      (item as any)?.actionId,
      normalizeActionId((item as any)?.title, 'custom_action'),
    );
    if (!actionId) continue;
    defaults.set(actionId, {
      actionId,
      title: normalizeText(
        (item as any)?.title,
        defaults.get(actionId)?.title || actionId,
      ),
      description: normalizeText(
        (item as any)?.description,
        defaults.get(actionId)?.description || '',
      ),
      route: normalizeRoute((item as any)?.route),
      kind: normalizeActionKind((item as any)?.kind),
      enabled: Boolean((item as any)?.enabled ?? defaults.get(actionId)?.enabled ?? true),
      responseMessage: normalizeText(
        (item as any)?.responseMessage,
        defaults.get(actionId)?.responseMessage || '',
      ),
      agendaGroupId:
        normalizeText((item as any)?.agendaGroupId) ||
        (actionId === 'schedule_service' ? 'agenda_tecnicos' : null),
      custom: Boolean((item as any)?.custom ?? defaults.get(actionId)?.custom ?? false),
    });
  }
  return Array.from(defaults.values());
}

function normalizeHourCut(value: unknown, fallback: number) {
  const normalized = Math.trunc(Number(value));
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(0, Math.min(23, normalized));
}

function normalizeSmartVariables(value: unknown): AtendimentoSmartVariablesConfig {
  const greeting = (value as any)?.greeting || {};
  const defaults = DEFAULT_ATENDIMENTO_SMART_VARIABLES.greeting || {};
  return {
    greeting: {
      timezone:
        normalizeText(greeting.timezone, defaults.timezone || 'America/Sao_Paulo') ||
        'America/Sao_Paulo',
      morning: normalizeText(greeting.morning, defaults.morning || 'Bom dia') || 'Bom dia',
      afternoon:
        normalizeText(greeting.afternoon, defaults.afternoon || 'Boa tarde') || 'Boa tarde',
      night: normalizeText(greeting.night, defaults.night || 'Boa noite') || 'Boa noite',
      morningStartHour: normalizeHourCut(
        greeting.morningStartHour,
        defaults.morningStartHour ?? 3,
      ),
      afternoonStartHour: normalizeHourCut(
        greeting.afternoonStartHour,
        defaults.afternoonStartHour ?? 12,
      ),
      nightStartHour: normalizeHourCut(greeting.nightStartHour, defaults.nightStartHour ?? 18),
    },
  };
}

function normalizeSceneRules(value: unknown): AtendimentoSceneRule[] {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item) => {
      const sceneId = normalizeActionId((item as any)?.sceneId, '');
      const conditionType = normalizeActionId((item as any)?.conditionType, '');
      if (!sceneId || !conditionType) return null;
      const metadata =
        (item as any)?.metadata && typeof (item as any).metadata === 'object' && !Array.isArray((item as any).metadata)
          ? ((item as any).metadata as Record<string, unknown>)
          : undefined;
      return {
        sceneId,
        conditionType,
        enabled: Boolean((item as any)?.enabled ?? true),
        ...(metadata ? { metadata } : {}),
      };
    })
    .filter((item): item is AtendimentoSceneRule => Boolean(item));
  const byKey = new Map(
    DEFAULT_FIRST_CONTACT_SCENE_RULES.map((rule) => [`${rule.sceneId}:${rule.conditionType}`, { ...rule }]),
  );
  normalized.forEach((rule) => byKey.set(`${rule.sceneId}:${rule.conditionType}`, rule));
  return Array.from(byKey.values());
}

function normalizeBotType(value: unknown): AtendimentoBotType | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'vendas') return 'vendas';
  if (normalized === 'atendimento') return 'atendimento';
  if (normalized === 'organizacao' || normalized === 'organização' || normalized === 'empresa') {
    return 'organizacao';
  }
  if (normalized === 'recovery') return 'recovery';
  if (normalized === 'prospeccao' || normalized === 'prospecção') return 'prospeccao';
  return null;
}

function normalizeSetupChannelMode(value: unknown): 'QR' | 'OFFICIAL' | null {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'QR' || normalized === 'QRCODE' || normalized === 'TEMPORARY') return 'QR';
  if (normalized === 'OFFICIAL' || normalized === 'META') return 'OFFICIAL';
  return null;
}

function normalizeSetupProvider(value: unknown): ChannelProvider | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'meta') return 'meta';
  if (normalized === 'evolution' || normalized === 'qr' || normalized === 'qrcode') return 'evolution';
  return null;
}

function normalizeAtendimentoBotSetup(value: unknown): AtendimentoBotSetup {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as any) : {};
  return {
    completed: Boolean(raw.completed),
    completedAt: normalizeText(raw.completedAt) || null,
    botType: normalizeBotType(raw.botType),
    channelMode: normalizeSetupChannelMode(raw.channelMode),
    provider: normalizeSetupProvider(raw.provider),
    configuredFrom: normalizeText(raw.configuredFrom) || null,
  };
}

export function normalizeAtendimentoBotConfig(
  payload: Partial<AtendimentoBotConfig> | null | undefined,
): AtendimentoBotConfig {
  const config = payload || {};
  const hasWelcomeButtons =
    Boolean(config) && Object.prototype.hasOwnProperty.call(config, 'welcomeButtons');
  return {
    setup: normalizeAtendimentoBotSetup((config as any).setup),
    variableCatalog: normalizeVariableCatalog(config.variableCatalog),
    actionCatalog: normalizeActionCatalog(config.actionCatalog),
    routingRules: {
      ...DEFAULT_ATENDIMENTO_BOT_CONFIG.routingRules,
      ...(config.routingRules || {}),
      globalBotEnabled:
        config.routingRules?.globalBotEnabled ??
        DEFAULT_ATENDIMENTO_BOT_CONFIG.routingRules.globalBotEnabled,
      checkRecoveryBeforeReply:
        config.routingRules?.checkRecoveryBeforeReply ??
        DEFAULT_ATENDIMENTO_BOT_CONFIG.routingRules.checkRecoveryBeforeReply,
      autoRouteDebtorsToRecovery:
        config.routingRules?.autoRouteDebtorsToRecovery ??
        DEFAULT_ATENDIMENTO_BOT_CONFIG.routingRules.autoRouteDebtorsToRecovery,
      autoReopenClosedConversation:
        config.routingRules?.autoReopenClosedConversation ??
        DEFAULT_ATENDIMENTO_BOT_CONFIG.routingRules.autoReopenClosedConversation,
      notifyOnNewInbound:
        config.routingRules?.notifyOnNewInbound ??
        DEFAULT_ATENDIMENTO_BOT_CONFIG.routingRules.notifyOnNewInbound,
    },
    smartVariables: normalizeSmartVariables((config as any).smartVariables),
    sceneRules: normalizeSceneRules((config as any).sceneRules),
    welcomeMessage: normalizeText(
      config.welcomeMessage,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.welcomeMessage,
    ),
    welcomeButtons: hasWelcomeButtons
      ? normalizeButtons(
          config.welcomeButtons,
          DEFAULT_ATENDIMENTO_BOT_CONFIG.welcomeButtons,
          'welcome_message',
        )
      : [],
    returningCustomerMessage: normalizeText(
      config.returningCustomerMessage,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.returningCustomerMessage,
    ),
    returningCustomerButtons: normalizeButtons(
      config.returningCustomerButtons,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.returningCustomerButtons,
      'returning_customer',
    ),
    mainMenuPrompt: normalizeText(
      config.mainMenuPrompt,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.mainMenuPrompt,
    ),
    mainMenuButtons: normalizeButtons(
      config.mainMenuButtons,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.mainMenuButtons,
      'main_menu',
    ),
    recoveryDetectedMessage: normalizeText(
      config.recoveryDetectedMessage,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.recoveryDetectedMessage,
    ),
    recoveryDetectedButtons: normalizeButtons(
      config.recoveryDetectedButtons,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.recoveryDetectedButtons,
      'recovery_detected',
    ),
    postActionPrompt: normalizeText(
      config.postActionPrompt,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.postActionPrompt,
    ),
    postActionButtons: normalizeButtons(
      config.postActionButtons,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.postActionButtons,
      'post_action',
    ),
    humanAckMessage: normalizeText(
      config.humanAckMessage,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.humanAckMessage,
    ),
    closeTopicMessage: normalizeText(
      config.closeTopicMessage,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.closeTopicMessage,
    ),
    blockedMessage: normalizeText(
      config.blockedMessage,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.blockedMessage,
    ),
  };
}

export function isAtendimentoBotSetupComplete(config: Partial<AtendimentoBotConfig> | null | undefined) {
  const normalized = normalizeAtendimentoBotConfig(config || {});
  const botType = normalized.setup.botType;
  return Boolean(
    normalized.setup.completed &&
      botType &&
      ['vendas', 'atendimento', 'organizacao', 'prospeccao', 'recovery'].includes(botType) &&
      normalizeText(normalized.mainMenuPrompt).length >= 8 &&
      (normalized.mainMenuButtons || []).length > 0,
  );
}

export function getProviderCapabilities(provider: ChannelProvider): ProviderCapabilities {
  return provider === 'meta'
    ? { ...META_PROVIDER_CAPABILITIES }
    : { ...EVOLUTION_PROVIDER_CAPABILITIES };
}

export function resolveProviderCapabilitiesFromCompany(company: {
  whatsappConnectionMode?: string | null;
} | null | undefined): ProviderCapabilities {
  const mode = String(company?.whatsappConnectionMode || '').trim().toUpperCase();
  return getProviderCapabilities(mode === 'OFFICIAL' ? 'meta' : 'evolution');
}

export function isAtendimentoRecoveryActionId(value: unknown) {
  const normalized = normalizeActionId(value, '');
  if (!normalized) return false;
  if ((ATENDIMENTO_RECOVERY_ACTION_IDS as readonly string[]).includes(normalized)) return true;
  return (
    normalized.includes('recovery') ||
    normalized.includes('payment') ||
    normalized.includes('payments') ||
    normalized.includes('debt') ||
    normalized.includes('financeiro') ||
    normalized.includes('financial')
  );
}

function isAtendimentoAgendaActionId(value: unknown) {
  const normalized = normalizeActionId(value, '');
  return normalized === 'schedule_service' || normalized.startsWith('agenda:');
}

function isSanitizedRecoveryAction(action: AtendimentoBotActionGuide) {
  return (
    action.route === 'recovery' ||
    action.kind === 'recovery_handoff' ||
    isAtendimentoRecoveryActionId(action.actionId)
  );
}

function isSanitizedAgendaAction(action: AtendimentoBotActionGuide) {
  return action.kind === 'agenda' || isAtendimentoAgendaActionId(action.actionId);
}

function sanitizeButtonListForAllowedActions(
  buttons: AtendimentoBotButton[],
  allowedActionIds: Set<string>,
  fallback: AtendimentoBotButton[] = [],
) {
  const sanitize = (items: AtendimentoBotButton[]) =>
    (items || [])
      .filter((button) => {
        const actionId = normalizeActionId(button.actionId, '');
        return actionId && allowedActionIds.has(actionId);
      })
      .map((button) => ({
        ...button,
        actionId: normalizeActionId(button.actionId, ''),
      }));

  const filtered = sanitize(buttons);
  return filtered.length ? filtered : sanitize(fallback);
}

export function sanitizeAtendimentoBotConfigForTenant(
  config: Partial<AtendimentoBotConfig> | null | undefined,
  options: {
    providerCapabilities: ProviderCapabilities;
    recoveryEnabled: boolean;
  },
): AtendimentoBotConfig {
  const normalized = normalizeAtendimentoBotConfig(config || {});
  const providerCapabilities = options.providerCapabilities || EVOLUTION_PROVIDER_CAPABILITIES;
  const recoveryEnabled = Boolean(options.recoveryEnabled);

  const actionCatalog = (normalized.actionCatalog || []).filter((action) => {
    if (!recoveryEnabled && isSanitizedRecoveryAction(action)) return false;
    if (!providerCapabilities.canUseAgendaBot && isSanitizedAgendaAction(action)) return false;
    return true;
  });
  const allowedActionIds = new Set(
    actionCatalog
      .map((action) => normalizeActionId(action.actionId, ''))
      .filter(Boolean),
  );

  return {
    ...normalized,
    setup: {
      ...normalized.setup,
      provider: normalized.setup.provider || providerCapabilities.provider,
    },
    variableCatalog: recoveryEnabled
      ? normalized.variableCatalog
      : normalized.variableCatalog.filter((item) => item.scope !== 'recovery'),
    actionCatalog,
    routingRules: {
      ...normalized.routingRules,
      globalBotEnabled: isAtendimentoBotSetupComplete(normalized)
        ? normalized.routingRules.globalBotEnabled
        : false,
      checkRecoveryBeforeReply: recoveryEnabled
        ? normalized.routingRules.checkRecoveryBeforeReply
        : false,
      autoRouteDebtorsToRecovery: recoveryEnabled
        ? normalized.routingRules.autoRouteDebtorsToRecovery
        : false,
    },
    welcomeButtons: sanitizeButtonListForAllowedActions(
      normalized.welcomeButtons,
      allowedActionIds,
      normalized.welcomeButtons.length ? DEFAULT_ATENDIMENTO_BOT_CONFIG.welcomeButtons : [],
    ),
    returningCustomerButtons: sanitizeButtonListForAllowedActions(
      normalized.returningCustomerButtons,
      allowedActionIds,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.returningCustomerButtons,
    ),
    mainMenuButtons: sanitizeButtonListForAllowedActions(
      normalized.mainMenuButtons,
      allowedActionIds,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.mainMenuButtons,
    ),
    recoveryDetectedButtons: recoveryEnabled
      ? sanitizeButtonListForAllowedActions(
          normalized.recoveryDetectedButtons,
          allowedActionIds,
          DEFAULT_ATENDIMENTO_BOT_CONFIG.recoveryDetectedButtons,
        )
      : [],
    postActionButtons: sanitizeButtonListForAllowedActions(
      normalized.postActionButtons,
      allowedActionIds,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.postActionButtons,
    ),
  };
}

function normalizeDayOfWeek(value: unknown) {
  const normalized = Math.trunc(Number(value));
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.min(6, normalized));
}

function normalizeTime(value: unknown, fallback: string) {
  const normalized = String(value || '').trim();
  if (/^\d{2}:\d{2}$/.test(normalized)) return normalized;
  return fallback;
}

function normalizeConnectionStatus(value: unknown, linkedEmail?: string): AtendimentoAgendaConnectionStatus {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'connected' || normalized === 'pending') {
    return String(linkedEmail || '').trim() ? 'pending' : 'not_linked';
  }
  return 'not_linked';
}

function normalizeAgendaSendType(value: unknown): AtendimentoAgendaSendType {
  return String(value || '').trim().toLowerCase() === 'lista' ? 'lista' : 'botoes';
}

function normalizeAgendaGuideActionType(value: unknown): AtendimentoAgendaGuideActionType {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'cancelar_agendamento') return 'cancelar_agendamento';
  if (normalized === 'acao_customizada') return 'acao_customizada';
  return 'abrir_agenda';
}

function normalizePositiveRange(value: unknown, fallback: number, min: number, max: number) {
  const normalized = Math.trunc(Number(value));
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(min, Math.min(max, normalized));
}

function normalizeAgendaSlug(value: unknown, fallback: string) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_:-]/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

function normalizeAgendaWorkdays(value: unknown, fallback: number[]) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => Math.trunc(Number(item)))
        .filter((item) => Number.isFinite(item) && item >= 0 && item <= 6),
    ),
  ).sort((left, right) => left - right);
  return normalized.length ? normalized : [...fallback];
}

function normalizeVisibleBusinessDays(value: unknown, fallback: number) {
  const normalized = Math.trunc(Number(value));
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(1, Math.min(14, normalized));
}

function normalizeHolidayList(value: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => String(item || '').trim())
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)),
    ),
  ).sort();
}

function normalizeAgendaSlots(value: unknown, fallback: AtendimentoAgendaSlot[]) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item, index) => {
      const id = normalizeActionId(
        (item as any)?.id,
        `agenda_slot_${index + 1}`,
      );
      const startTime = normalizeTime((item as any)?.startTime, '09:00');
      const endTime = normalizeTime((item as any)?.endTime, '10:00');
      return {
        id,
        label:
          normalizeText((item as any)?.label) ||
          `${startTime}-${endTime}`,
        dayOfWeek: normalizeDayOfWeek((item as any)?.dayOfWeek),
        startTime,
        endTime,
        enabled: Boolean((item as any)?.enabled ?? true),
      };
    })
    .filter((item) => item.id);
  return normalized.length ? normalized : fallback.map((item) => ({ ...item }));
}

export function normalizeAtendimentoAgendaConfig(
  payload: Partial<AtendimentoAgendaConfig> | null | undefined,
): AtendimentoAgendaConfig {
  const config = payload || {};
  const groupsInput = Array.isArray(config.groups) ? config.groups : [];
  const groups = groupsInput
    .map((group, index) => {
      const id = normalizeActionId((group as any)?.id, `agenda_group_${index + 1}`);
      const fallback = DEFAULT_ATENDIMENTO_AGENDA_CONFIG.groups[index] || DEFAULT_ATENDIMENTO_AGENDA_CONFIG.groups[0];
      const linkedEmail = normalizeText((group as any)?.linkedEmail, fallback?.linkedEmail || '').toLowerCase();
      return {
        id,
        slug: normalizeAgendaSlug((group as any)?.slug, fallback?.slug || id),
        title: normalizeText((group as any)?.title, fallback?.title || `Agenda ${index + 1}`),
        description: normalizeText((group as any)?.description, fallback?.description || ''),
        buttonLabel: normalizeText((group as any)?.buttonLabel, fallback?.buttonLabel || 'Abrir agenda'),
        actionType: normalizeAgendaGuideActionType(
          (group as any)?.actionType ?? fallback?.actionType,
        ),
        linkedAgendaId:
          normalizeActionId((group as any)?.linkedAgendaId, fallback?.linkedAgendaId || id) || id,
        customActionKey: normalizeText(
          (group as any)?.customActionKey,
          fallback?.customActionKey || '',
        ) || null,
        sortOrder: normalizePositiveRange(
          (group as any)?.sortOrder,
          fallback?.sortOrder ?? index,
          0,
          999,
        ),
        introMessage: normalizeText((group as any)?.introMessage, fallback?.introMessage || ''),
        emptyMessage: normalizeText((group as any)?.emptyMessage, fallback?.emptyMessage || ''),
        linkedEmail,
        linkedUserName: normalizeText((group as any)?.linkedUserName, fallback?.linkedUserName || ''),
        connectionStatus: normalizeConnectionStatus(
          (group as any)?.connectionStatus ?? fallback?.connectionStatus,
          linkedEmail,
        ),
        accentColor:
          normalizeText((group as any)?.accentColor, fallback?.accentColor || '#4da36f') ||
          '#4da36f',
        isActive: Boolean((group as any)?.isActive ?? fallback?.isActive ?? true),
        workdays: normalizeAgendaWorkdays(
          (group as any)?.workdays,
          Array.from(
            new Set(
              Array.isArray((group as any)?.slots)
                ? ((group as any).slots as Array<{ dayOfWeek?: unknown }>)
                    .map((slot) => Math.trunc(Number(slot?.dayOfWeek)))
                    .filter((day) => Number.isFinite(day) && day >= 0 && day <= 6)
                : fallback?.workdays || [1, 2, 3, 4, 5],
            ),
          ),
        ),
        visibleBusinessDays: normalizeVisibleBusinessDays(
          (group as any)?.visibleBusinessDays,
          fallback?.visibleBusinessDays || 7,
        ),
        searchWindowDays: normalizePositiveRange(
          (group as any)?.searchWindowDays,
          fallback?.searchWindowDays || fallback?.visibleBusinessDays || 7,
          1,
          30,
        ),
        suggestedSlotsCount: normalizePositiveRange(
          (group as any)?.suggestedSlotsCount,
          fallback?.suggestedSlotsCount || 3,
          1,
          10,
        ),
        fallbackFutureSlotsCount: normalizePositiveRange(
          (group as any)?.fallbackFutureSlotsCount,
          fallback?.fallbackFutureSlotsCount || 3,
          0,
          10,
        ),
        noImmediateAvailabilityMessage: normalizeText(
          (group as any)?.noImmediateAvailabilityMessage,
          fallback?.noImmediateAvailabilityMessage || fallback?.emptyMessage || '',
        ),
        simpleMode: Boolean((group as any)?.simpleMode ?? fallback?.simpleMode ?? false),
        capacityPerDay: normalizePositiveRange(
          (group as any)?.capacityPerDay,
          fallback?.capacityPerDay || 1,
          1,
          20,
        ),
        reminderMinutes: normalizePositiveRange(
          (group as any)?.reminderMinutes,
          fallback?.reminderMinutes || 60,
          0,
          1440,
        ),
        slots: normalizeAgendaSlots((group as any)?.slots, fallback?.slots || []),
      };
    })
    .filter((group) => group.id);

  return {
    timezone: normalizeText(
      config.timezone,
      DEFAULT_ATENDIMENTO_AGENDA_CONFIG.timezone,
    ) || DEFAULT_ATENDIMENTO_AGENDA_CONFIG.timezone,
    initialMessage: {
      greeting: normalizeText(
        (config as any)?.initialMessage?.greeting,
        DEFAULT_ATENDIMENTO_AGENDA_CONFIG.initialMessage.greeting,
      ),
      companyLabel: normalizeText(
        (config as any)?.initialMessage?.companyLabel,
        DEFAULT_ATENDIMENTO_AGENDA_CONFIG.initialMessage.companyLabel,
      ),
      attendantLabel: normalizeText(
        (config as any)?.initialMessage?.attendantLabel,
        DEFAULT_ATENDIMENTO_AGENDA_CONFIG.initialMessage.attendantLabel,
      ),
      introText: normalizeText(
        (config as any)?.initialMessage?.introText,
        DEFAULT_ATENDIMENTO_AGENDA_CONFIG.initialMessage.introText,
      ),
      sendType: normalizeAgendaSendType(
        (config as any)?.initialMessage?.sendType ??
          DEFAULT_ATENDIMENTO_AGENDA_CONFIG.initialMessage.sendType,
      ),
      fallbackText: normalizeText(
        (config as any)?.initialMessage?.fallbackText,
        DEFAULT_ATENDIMENTO_AGENDA_CONFIG.initialMessage.fallbackText,
      ),
    },
    flowMessages: {
      availabilityIntro: normalizeText(
        (config as any)?.flowMessages?.availabilityIntro,
        DEFAULT_ATENDIMENTO_AGENDA_CONFIG.flowMessages.availabilityIntro,
      ),
      fallbackFutureSlots: normalizeText(
        (config as any)?.flowMessages?.fallbackFutureSlots,
        DEFAULT_ATENDIMENTO_AGENDA_CONFIG.flowMessages.fallbackFutureSlots,
      ),
      confirmationMessage: normalizeText(
        (config as any)?.flowMessages?.confirmationMessage,
        DEFAULT_ATENDIMENTO_AGENDA_CONFIG.flowMessages.confirmationMessage,
      ),
      cancellationPrompt: normalizeText(
        (config as any)?.flowMessages?.cancellationPrompt,
        DEFAULT_ATENDIMENTO_AGENDA_CONFIG.flowMessages.cancellationPrompt,
      ),
      cancellationSuccess: normalizeText(
        (config as any)?.flowMessages?.cancellationSuccess,
        DEFAULT_ATENDIMENTO_AGENDA_CONFIG.flowMessages.cancellationSuccess,
      ),
      cancellationNotFound: normalizeText(
        (config as any)?.flowMessages?.cancellationNotFound,
        DEFAULT_ATENDIMENTO_AGENDA_CONFIG.flowMessages.cancellationNotFound,
      ),
    },
    holidays: normalizeHolidayList((config as any)?.holidays),
    groups: groups.length
      ? groups
      : DEFAULT_ATENDIMENTO_AGENDA_CONFIG.groups.map((group) => ({
          ...group,
          slots: group.slots.map((slot) => ({ ...slot })),
        })),
  };
}

export function buildAtendimentoAgendaActionId(groupId: string) {
  return `agenda_group_${normalizeActionId(groupId, 'default')}`;
}

export function parseAtendimentoAgendaActionId(actionIdRaw: string | null | undefined) {
  const normalized = String(actionIdRaw || '').trim().toLowerCase();
  if (!normalized.startsWith('agenda_group_')) return null;
  return normalized.replace(/^agenda_group_/, '').trim() || null;
}
