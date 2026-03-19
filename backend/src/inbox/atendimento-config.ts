export const ATENDIMENTO_BOT_CONFIG_CHANNEL = '__ATENDIMENTO_BOT_CONFIG__';
export const ATENDIMENTO_BOT_CONFIG_TITLE = 'config_v1';

export const ATENDIMENTO_AGENDA_CONFIG_CHANNEL = '__ATENDIMENTO_AGENDA_CONFIG__';
export const ATENDIMENTO_AGENDA_CONFIG_TITLE = 'config_v1';

export const ATENDIMENTO_BUTTON_ID_PREFIX = 'atendimento_';

export const ATENDIMENTO_BOT_ACTION_IDS = [
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
  actionId: AtendimentoBotAnyActionId;
  title: string;
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

export type AtendimentoAgendaGroup = {
  id: string;
  title: string;
  description: string;
  buttonLabel: string;
  introMessage: string;
  emptyMessage: string;
  slots: AtendimentoAgendaSlot[];
};

export type AtendimentoAgendaConfig = {
  timezone: string;
  groups: AtendimentoAgendaGroup[];
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
    'Oi, {{cliente}}. Eu sou o atendimento digital da {{empresa}}. Posso te mostrar as opcoes disponiveis agora.',
  returningCustomerMessage:
    'Que bom te ver de novo, {{cliente}}. Vou continuar daqui e te mostrar as opcoes disponiveis.',
  mainMenuPrompt: 'Escolha abaixo como deseja continuar:',
  mainMenuButtons: [{ actionId: 'talk_human', title: 'Falar com atendente' }],
  recoveryDetectedMessage:
    'Localizei um cadastro com valor em aberto de {{valor_formatado}} no Recovery. Podemos conversar sobre isso agora ou prefere falar com um atendente?',
  recoveryDetectedButtons: [
    { actionId: 'enter_recovery', title: 'Falar sobre o debito' },
    { actionId: 'talk_human', title: 'Falar com atendente' },
  ],
  postActionPrompt: 'Se precisar de mais alguma coisa, posso continuar por aqui.',
  postActionButtons: [
    { actionId: 'show_main_menu', title: 'Voltar ao menu' },
    { actionId: 'talk_human', title: 'Atendimento humano' },
  ],
  humanAckMessage: 'Perfeito. Vou encaminhar sua conversa para um atendente agora.',
  closeTopicMessage: 'Entendido. Vou encerrar esta conversa por agora. Quando precisar, e so chamar.',
  blockedMessage: 'Este contato esta bloqueado no Atendimento.',
};

export const DEFAULT_ATENDIMENTO_AGENDA_CONFIG: AtendimentoAgendaConfig = {
  timezone: 'America/Sao_Paulo',
  groups: [
    {
      id: 'agenda_tecnicos',
      title: 'Tecnicos',
      description: 'Horarios de manutencao e visitas tecnicas.',
      buttonLabel: 'Agenda tecnicos',
      introMessage:
        'Esses sao os horarios disponiveis para {{agenda_nome}}. Se quiser, um atendente pode confirmar o melhor encaixe.',
      emptyMessage: 'No momento nao ha horarios ativos para essa agenda.',
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
  ],
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

function normalizeButtons(value: unknown, fallback: AtendimentoBotButton[]) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item) => {
      const actionId = normalizeActionId((item as any)?.actionId, '');
      const title = normalizeText((item as any)?.title);
      if (!actionId || !title) return null;
      return { actionId, title };
    })
    .filter(Boolean) as AtendimentoBotButton[];
  return normalized.length ? normalized : fallback.map((item) => ({ ...item }));
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
    returningCustomerMessage: normalizeText(
      config.returningCustomerMessage,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.returningCustomerMessage,
    ),
    mainMenuPrompt: normalizeText(
      config.mainMenuPrompt,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.mainMenuPrompt,
    ),
    mainMenuButtons: normalizeButtons(
      config.mainMenuButtons,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.mainMenuButtons,
    ),
    recoveryDetectedMessage: normalizeText(
      config.recoveryDetectedMessage,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.recoveryDetectedMessage,
    ),
    recoveryDetectedButtons: normalizeButtons(
      config.recoveryDetectedButtons,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.recoveryDetectedButtons,
    ),
    postActionPrompt: normalizeText(
      config.postActionPrompt,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.postActionPrompt,
    ),
    postActionButtons: normalizeButtons(
      config.postActionButtons,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.postActionButtons,
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
        title: normalizeText((group as any)?.title, fallback?.title || `Agenda ${index + 1}`),
        description: normalizeText((group as any)?.description, fallback?.description || ''),
        buttonLabel: normalizeText((group as any)?.buttonLabel, fallback?.buttonLabel || 'Abrir agenda'),
        introMessage: normalizeText((group as any)?.introMessage, fallback?.introMessage || ''),
        emptyMessage: normalizeText((group as any)?.emptyMessage, fallback?.emptyMessage || ''),
        slots: normalizeAgendaSlots((group as any)?.slots, fallback?.slots || []),
      };
    })
    .filter((group) => group.id);

  return {
    timezone: normalizeText(
      config.timezone,
      DEFAULT_ATENDIMENTO_AGENDA_CONFIG.timezone,
    ) || DEFAULT_ATENDIMENTO_AGENDA_CONFIG.timezone,
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

