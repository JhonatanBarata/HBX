export type InboxRouteTarget = "recovery" | "atendimento";
export type InboxStatus = "new" | "open" | "closed" | "blocked";

export type Customer = {
  id: string;
  phone: string;
  name: string | null;
};

export type AtendimentoCustomer = {
  id: string;
  companyId: number;
  name: string | null;
  phone: string;
  phoneNormalized: string;
  registrationOrigin: string;
  registrationStatus: string;
  route: string;
  notes: string | null;
  lastMessageAt: string | null;
  conversationId: number | null;
  createdAt: string;
  updatedAt: string;
  // Recovery enrichment (null when not linked to recovery)
  recoveryCustomerId: string | null;
  openAmount: number | null;
  recoveryStatus: string | null;
};

export type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound" | string;
  content: string;
  createdAt: string;
  messageType: string;
  senderType: string;
  sourceModule?: string | null;
  status: string;
  error: string | null;
};

export type InboxConversation = {
  id: string;
  status: InboxStatus | string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  routeTarget: InboxRouteTarget;
  routeReason: string;
  recoveryCustomerId: string | null;
  recoveryCustomerName: string | null;
  recoveryOpenAmount: number;
  recoveryCurrentStep: string | null;
  recoverySuggestedPath: string;
  latestSourceModule: string | null;
  isBlocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  metadata?: Record<string, unknown> | null;
  customer: Customer;
  messages: InboxMessage[];
};

export type AtendimentoBotVariableScope = "shared" | "atendimento" | "recovery";

export type AtendimentoBotVariableDefinition = {
  key: string;
  label: string;
  example: string;
  description: string;
  scope: AtendimentoBotVariableScope;
  required: boolean;
};

export type AtendimentoBotActionKind =
  | "reply"
  | "human_handoff"
  | "recovery_handoff"
  | "close"
  | "show_menu"
  | "agenda";

export type AtendimentoBotButton = {
  buttonId: string;
  actionId: string;
  title: string;
};

export type AtendimentoBotActionGuide = {
  actionId: string;
  title: string;
  description: string;
  route: AtendimentoBotVariableScope;
  kind: AtendimentoBotActionKind;
  enabled: boolean;
  responseMessage?: string;
  agendaGroupId?: string | null;
  custom?: boolean;
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

export const ATENDIMENTO_QUEUE_EVENT = "atendimento-human-queue";

function normalizeButtonId(value: string, fallback: string) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_:-]/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function buildDefaultButtonId(sectionKey: string, actionId: string, index: number) {
  return normalizeButtonId(`${sectionKey}_${actionId || "action"}_${index + 1}`, `${sectionKey}_${index + 1}`);
}

function makeDefaultButton(sectionKey: string, actionId: string, title: string, index: number): AtendimentoBotButton {
  return {
    buttonId: buildDefaultButtonId(sectionKey, actionId, index),
    actionId,
    title,
  };
}

export const DEFAULT_ATENDIMENTO_BOT_CONFIG: AtendimentoBotConfig = {
  variableCatalog: [
    {
      key: "cliente",
      label: "Nome do cliente",
      example: "Maria Oliveira",
      description: "Nome mostrado nas mensagens do Atendimento.",
      scope: "shared",
      required: true,
    },
    {
      key: "empresa",
      label: "Nome da empresa",
      example: "Colsani Ar Condicionado",
      description: "Empresa logada no tenant atual.",
      scope: "shared",
      required: true,
    },
    {
      key: "funcionario",
      label: "Atendente responsavel",
      example: "Leo Colsani",
      description: "Usado quando a conversa precisa ficar mais humana.",
      scope: "atendimento",
      required: false,
    },
    {
      key: "valor_formatado",
      label: "Valor em aberto",
      example: "R$ 480,00",
      description: "Valor vindo do Recovery quando o cliente esta devendo.",
      scope: "recovery",
      required: false,
    },
    {
      key: "agenda_nome",
      label: "Nome da agenda",
      example: "Tecnicos",
      description: "Nome da agenda escolhida pelo cliente.",
      scope: "atendimento",
      required: false,
    },
    {
      key: "agenda_slots",
      label: "Horarios disponiveis",
      example: "Seg 09:00-11:00 | Qua 14:00-18:00",
      description: "Lista renderizada com os horarios ativos da agenda.",
      scope: "atendimento",
      required: false,
    },
  ],
  actionCatalog: [
    {
      actionId: "start_quick_registration",
      title: "Iniciar cadastro rapido",
      description: "Abre a coleta inicial de dados para um novo cliente sem depender de texto livre.",
      route: "atendimento",
      kind: "reply",
      enabled: true,
      responseMessage:
        "Perfeito. Vamos iniciar seu cadastro rapido agora. Me envie seu nome completo para eu abrir a ficha inicial.",
    },
    {
      actionId: "talk_human",
      title: "Falar com atendente",
      description: "Entrega a conversa para a fila humana do Atendimento.",
      route: "atendimento",
      kind: "human_handoff",
      enabled: true,
    },
    {
      actionId: "close_topic",
      title: "Encerrar conversa",
      description: "Fecha a conversa sem manter o bot ativo.",
      route: "shared",
      kind: "close",
      enabled: true,
    },
    {
      actionId: "enter_recovery",
      title: "Falar sobre o debito",
      description: "Entrega a conversa para o menu do Recovery quando houver inadimplencia.",
      route: "recovery",
      kind: "recovery_handoff",
      enabled: true,
    },
    {
      actionId: "show_main_menu",
      title: "Mostrar menu principal",
      description: "Mostra novamente o menu principal do Atendimento.",
      route: "atendimento",
      kind: "show_menu",
      enabled: true,
    },
  ],
  routingRules: {
    checkRecoveryBeforeReply: true,
    autoRouteDebtorsToRecovery: true,
    autoReopenClosedConversation: true,
    notifyOnNewInbound: true,
  },
  welcomeMessage:
    "Ola, tudo bem?\nEu sou o atendimento digital da {{empresa}}. Nao localizamos em nosso cadastro seu telefone.",
  welcomeButtons: [
    makeDefaultButton("welcome_message", "start_quick_registration", "Fazer cadastro rapido", 0),
    makeDefaultButton("welcome_message", "talk_human", "Falar com atendente", 1),
  ],
  mainMenuPrompt: "Escolha abaixo como deseja continuar:",
  mainMenuButtons: [makeDefaultButton("main_menu", "talk_human", "Falar com atendente", 0)],
  returningCustomerMessage:
    "Que bom te ver de novo, {{cliente}}. Vou continuar daqui e te mostrar as opcoes disponiveis.",
  recoveryDetectedMessage:
    "Localizei um cadastro com valor em aberto de {{valor_formatado}} no Recovery. Podemos conversar sobre isso agora ou prefere falar com um atendente?",
  recoveryDetectedButtons: [
    makeDefaultButton("recovery_detected", "enter_recovery", "Falar sobre o debito", 0),
    makeDefaultButton("recovery_detected", "talk_human", "Falar com atendente", 1),
  ],
  postActionPrompt: "Se precisar de mais alguma coisa, posso continuar por aqui.",
  postActionButtons: [
    makeDefaultButton("post_action", "show_main_menu", "Voltar ao menu", 0),
    makeDefaultButton("post_action", "talk_human", "Atendimento humano", 1),
  ],
  humanAckMessage: "Perfeito. Vou encaminhar sua conversa para um atendente agora.",
  closeTopicMessage: "Entendido. Vou encerrar esta conversa por agora. Quando precisar, e so chamar.",
  blockedMessage: "Este contato esta bloqueado no Atendimento.",
};

export const DEFAULT_ATENDIMENTO_AGENDA_CONFIG: AtendimentoAgendaConfig = {
  timezone: "America/Sao_Paulo",
  groups: [
    {
      id: "agenda_tecnicos",
      title: "Tecnicos",
      description: "Horarios de manutencao e visitas tecnicas.",
      buttonLabel: "Agenda tecnicos",
      introMessage:
        "Esses sao os horarios disponiveis para {{agenda_nome}}. Se quiser, um atendente pode confirmar o melhor encaixe.\n\n{{agenda_slots}}",
      emptyMessage: "No momento nao ha horarios ativos para essa agenda.",
      slots: [
        {
          id: "agenda_tecnicos_seg_0900",
          label: "Segunda 09:00-11:00",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "11:00",
          enabled: true,
        },
        {
          id: "agenda_tecnicos_qua_1400",
          label: "Quarta 14:00-18:00",
          dayOfWeek: 3,
          startTime: "14:00",
          endTime: "18:00",
          enabled: true,
        },
      ],
    },
  ],
};

function uniqueByKey<T extends { key: string }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) map.set(item.key, item);
  return Array.from(map.values());
}

function uniqueByAction<T extends { actionId: string }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) map.set(item.actionId, item);
  return Array.from(map.values());
}

export function normalizeBotConfig(
  payload: Partial<AtendimentoBotConfig> | null | undefined,
): AtendimentoBotConfig {
  const hasWelcomeButtons = Boolean(payload) && Object.prototype.hasOwnProperty.call(payload, "welcomeButtons");
  const merged = {
    ...DEFAULT_ATENDIMENTO_BOT_CONFIG,
    ...(payload || {}),
  };

  return {
    ...merged,
    variableCatalog: uniqueByKey(
      [...DEFAULT_ATENDIMENTO_BOT_CONFIG.variableCatalog, ...((payload?.variableCatalog as AtendimentoBotVariableDefinition[]) || [])].map(
        (item) => ({
          key: String(item.key || "").trim(),
          label: String(item.label || item.key || "").trim(),
          example: String(item.example || "").trim(),
          description: String(item.description || "").trim(),
          scope: (["shared", "atendimento", "recovery"] as const).includes(item.scope)
            ? item.scope
            : "shared",
          required: Boolean(item.required),
        }),
      ),
    ).filter((item) => item.key),
    actionCatalog: uniqueByAction(
      [...DEFAULT_ATENDIMENTO_BOT_CONFIG.actionCatalog, ...((payload?.actionCatalog as AtendimentoBotActionGuide[]) || [])].map(
        (item) => ({
          actionId: String(item.actionId || "").trim(),
          title: String(item.title || item.actionId || "").trim(),
          description: String(item.description || "").trim(),
          route: (["shared", "atendimento", "recovery"] as const).includes(item.route)
            ? item.route
            : "shared",
          kind: (
            ["reply", "human_handoff", "recovery_handoff", "close", "show_menu", "agenda"] as const
          ).includes(item.kind)
            ? item.kind
            : "reply",
          enabled: item.enabled ?? true,
          responseMessage: String(item.responseMessage || "").trim(),
          agendaGroupId: String(item.agendaGroupId || "").trim() || null,
          custom: Boolean(item.custom),
        }),
      ),
    ).filter((item) => item.actionId),
    welcomeButtons: hasWelcomeButtons
      ? normalizeButtons(
          payload?.welcomeButtons,
          DEFAULT_ATENDIMENTO_BOT_CONFIG.welcomeButtons,
          "welcome_message",
        )
      : [],
    mainMenuButtons: normalizeButtons(
      payload?.mainMenuButtons,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.mainMenuButtons,
      "main_menu",
    ),
    recoveryDetectedButtons: normalizeButtons(
      payload?.recoveryDetectedButtons,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.recoveryDetectedButtons,
      "recovery_detected",
    ),
    postActionButtons: normalizeButtons(
      payload?.postActionButtons,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.postActionButtons,
      "post_action",
    ),
    routingRules: {
      ...DEFAULT_ATENDIMENTO_BOT_CONFIG.routingRules,
      ...(payload?.routingRules || {}),
    },
  };
}

function normalizeButtons(
  buttons: AtendimentoBotButton[] | undefined,
  fallback: AtendimentoBotButton[],
  sectionKey: string,
) {
  if (buttons === undefined || buttons === null) {
    return fallback.map((button) => ({ ...button }));
  }
  const seen = new Set<string>();
  return buttons
    .map((button, index) => {
      const buttonId = normalizeButtonId(button.buttonId, buildDefaultButtonId(sectionKey, button.actionId, index));
      if (seen.has(buttonId)) return null;
      seen.add(buttonId);
      return {
        buttonId,
      actionId: String(button.actionId || "").trim(),
      title: String(button.title || "").trim(),
      };
    })
    .filter((button): button is AtendimentoBotButton => Boolean(button?.buttonId && button.actionId && button.title));
}

export function normalizeAgendaConfig(
  payload: Partial<AtendimentoAgendaConfig> | null | undefined,
): AtendimentoAgendaConfig {
  return {
    timezone: String(payload?.timezone || DEFAULT_ATENDIMENTO_AGENDA_CONFIG.timezone).trim(),
    groups:
      Array.isArray(payload?.groups) && payload.groups.length
        ? payload.groups.map((group, groupIndex) => ({
            id: String(group.id || `agenda_group_${groupIndex + 1}`).trim(),
            title: String(group.title || `Agenda ${groupIndex + 1}`).trim(),
            description: String(group.description || "").trim(),
            buttonLabel: String(group.buttonLabel || group.title || "Abrir agenda").trim(),
            introMessage: String(group.introMessage || "").trim(),
            emptyMessage: String(group.emptyMessage || "Sem horarios ativos.").trim(),
            slots: Array.isArray(group.slots)
              ? group.slots.map((slot, slotIndex) => ({
                  id: String(slot.id || `${group.id || `agenda_group_${groupIndex + 1}`}_${slotIndex + 1}`).trim(),
                  label: String(slot.label || `${slot.startTime}-${slot.endTime}`).trim(),
                  dayOfWeek: Number(slot.dayOfWeek || 0),
                  startTime: String(slot.startTime || "09:00").trim(),
                  endTime: String(slot.endTime || "10:00").trim(),
                  enabled: slot.enabled ?? true,
                }))
              : [],
          }))
        : DEFAULT_ATENDIMENTO_AGENDA_CONFIG.groups.map((group) => ({
            ...group,
            slots: group.slots.map((slot) => ({ ...slot })),
          })),
  };
}

export function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function getMessagePreview(message?: InboxMessage | null) {
  if (!message) return "Sem mensagens";
  const content = String(message.content || "").trim();
  if (content) return content;
  const type = String(message.messageType || "text").trim().toLowerCase();
  if (type === "image") return "[Imagem recebida]";
  if (type === "audio") return "[Audio recebido]";
  if (type === "document") return "[Documento recebido]";
  if (type === "interactive") return "[Interacao recebida]";
  if (type === "button") return "[Botao recebido]";
  if (type === "system_event") return "[Evento do sistema]";
  return `[${type || "mensagem"}]`;
}

export function buildAgendaActionId(groupId: string) {
  return `agenda_group_${String(groupId || "").trim()}`;
}

export function formatAgendaPreview(group: AtendimentoAgendaGroup) {
  return [...(group.slots || [])]
    .filter((slot) => slot.enabled)
    .sort((left, right) => {
      if (left.dayOfWeek !== right.dayOfWeek) return left.dayOfWeek - right.dayOfWeek;
      return String(left.startTime || "").localeCompare(String(right.startTime || ""));
    })
    .slice(0, 6)
    .map((slot) => `${formatWeekday(slot.dayOfWeek)} ${slot.startTime}-${slot.endTime}`)
    .join(" | ");
}

export function formatWeekday(dayOfWeek: number) {
  return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"][Math.max(0, Math.min(6, Number(dayOfWeek || 0)))] || "Dia";
}

export function createCustomAction(config: AtendimentoBotConfig): AtendimentoBotActionGuide {
  const customCount = config.actionCatalog.filter((item) => item.custom).length + 1;
  return {
    actionId: `custom_action_${customCount}`,
    title: `Acao custom ${customCount}`,
    description: "Explique aqui o que essa acao deve fazer.",
    route: "atendimento",
    kind: "reply",
    enabled: true,
    responseMessage: "Recebi sua solicitacao e vou seguir com esse fluxo.",
    custom: true,
  };
}
