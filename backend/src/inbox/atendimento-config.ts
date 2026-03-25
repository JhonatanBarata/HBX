export const ATENDIMENTO_BOT_CONFIG_CHANNEL = '__ATENDIMENTO_BOT_CONFIG__';
export const ATENDIMENTO_BOT_CONFIG_TITLE = 'config_v1';

export const ATENDIMENTO_AGENDA_CONFIG_CHANNEL = '__ATENDIMENTO_AGENDA_CONFIG__';
export const ATENDIMENTO_AGENDA_CONFIG_TITLE = 'config_v1';

export const ATENDIMENTO_BUTTON_ID_PREFIX = 'atendimento_';

export const ATENDIMENTO_BOT_ACTION_IDS = [
  'start_quick_registration',
  'talk_human',
  'close_topic',
  'enter_recovery',
  'show_main_menu',
] as const;

export type AtendimentoBotActionId = (typeof ATENDIMENTO_BOT_ACTION_IDS)[number];
export type AtendimentoBotAnyActionId = AtendimentoBotActionId | string;

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
  checkRecoveryBeforeReply: boolean;
  autoRouteDebtorsToRecovery: boolean;
  autoReopenClosedConversation: boolean;
  notifyOnNewInbound: boolean;
};

export type AtendimentoBotConfig = {
  variableCatalog: AtendimentoBotVariableDefinition[];
  actionCatalog: AtendimentoBotActionGuide[];
  routingRules: AtendimentoRoutingRules;
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
    title: 'Falar sobre o debito',
    description: 'Entrega a conversa para o menu do Recovery quando houver inadimplencia.',
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

export const DEFAULT_ATENDIMENTO_BOT_CONFIG: AtendimentoBotConfig = {
  variableCatalog: DEFAULT_VARIABLE_CATALOG,
  actionCatalog: DEFAULT_ACTION_CATALOG,
  routingRules: {
    checkRecoveryBeforeReply: true,
    autoRouteDebtorsToRecovery: true,
    autoReopenClosedConversation: true,
    notifyOnNewInbound: true,
  },
  welcomeMessage:
    'Ola, tudo bem?\nEu sou o atendimento digital da {{empresa}}. Nao localizamos em nosso cadastro seu telefone.',
  welcomeButtons: [
    makeDefaultButton(
      'welcome_message',
      'start_quick_registration',
      'Fazer cadastro rapido',
      0,
    ),
    makeDefaultButton('welcome_message', 'talk_human', 'Falar com atendente', 1),
  ],
  returningCustomerMessage:
    'Que bom te ver de novo, {{cliente}}. Vou continuar daqui e te mostrar as opcoes disponiveis.',
  returningCustomerButtons: [
    makeDefaultButton('returning_customer', 'show_main_menu', 'Ver opcoes', 0),
    makeDefaultButton('returning_customer', 'talk_human', 'Falar com atendente', 1),
  ],
  mainMenuPrompt: 'Escolha abaixo como deseja continuar:',
  mainMenuButtons: [makeDefaultButton('main_menu', 'talk_human', 'Falar com atendente', 0)],
  recoveryDetectedMessage:
    'Localizei um cadastro com valor em aberto de {{valor_formatado}} no Recovery. Podemos conversar sobre isso agora ou prefere falar com um atendente?',
  recoveryDetectedButtons: [
    makeDefaultButton('recovery_detected', 'enter_recovery', 'Falar sobre o debito', 0),
    makeDefaultButton('recovery_detected', 'talk_human', 'Falar com atendente', 1),
  ],
  postActionPrompt: 'Se precisar de mais alguma coisa, posso continuar por aqui.',
  postActionButtons: [
    makeDefaultButton('post_action', 'show_main_menu', 'Voltar ao menu', 0),
    makeDefaultButton('post_action', 'talk_human', 'Atendimento humano', 1),
  ],
  humanAckMessage: 'Perfeito. Vou encaminhar sua conversa para um atendente agora.',
  closeTopicMessage: 'Entendido. Vou encerrar esta conversa por agora. Quando precisar, e so chamar.',
  blockedMessage: 'Este contato esta bloqueado no Atendimento.',
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
  groups: [
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
  ],
  holidays: [],
};

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
      agendaGroupId: normalizeText((item as any)?.agendaGroupId) || null,
      custom: Boolean((item as any)?.custom ?? defaults.get(actionId)?.custom ?? false),
    });
  }
  return Array.from(defaults.values());
}

export function normalizeAtendimentoBotConfig(
  payload: Partial<AtendimentoBotConfig> | null | undefined,
): AtendimentoBotConfig {
  const config = payload || {};
  const hasWelcomeButtons =
    Boolean(config) && Object.prototype.hasOwnProperty.call(config, 'welcomeButtons');
  return {
    variableCatalog: normalizeVariableCatalog(config.variableCatalog),
    actionCatalog: normalizeActionCatalog(config.actionCatalog),
    routingRules: {
      ...DEFAULT_ATENDIMENTO_BOT_CONFIG.routingRules,
      ...(config.routingRules || {}),
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

function normalizeConnectionStatus(value: unknown): AtendimentoAgendaConnectionStatus {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'connected') return 'connected';
  if (normalized === 'pending') return 'pending';
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
        linkedEmail: normalizeText((group as any)?.linkedEmail, fallback?.linkedEmail || '').toLowerCase(),
        linkedUserName: normalizeText((group as any)?.linkedUserName, fallback?.linkedUserName || ''),
        connectionStatus: normalizeConnectionStatus(
          (group as any)?.connectionStatus ?? fallback?.connectionStatus,
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
