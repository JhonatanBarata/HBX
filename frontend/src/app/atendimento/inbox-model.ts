import type { ChannelProvider, ProviderCapabilities } from "@/lib/provider-capabilities";

export type InboxRouteTarget = "recovery" | "atendimento" | "prospeccao" | "conversas" | "groups";
export type InboxStatus = "new" | "open" | "closed" | "blocked";

export type VendasProspeccaoStage =
  | "pending_send"
  | "scheduled_send"
  | "sent_waiting"
  | "reply_received"
  | "expired_no_reply"
  | "needs_review"
  | "no_whatsapp"
  | "negative_reply";

export type VendasProspeccaoMetadata = {
  stage?: VendasProspeccaoStage | string | null;
  firstOutboundAt?: string | null;
  lastInboundAt?: string | null;
  replyDeadlineAt?: string | null;
  leadSegment?: string | null;
  campaignSegment?: string | null;
  mismatchReason?: string | null;
};

export type Customer = {
  id: string;
  phone: string;
  name: string | null;
  avatarUrl?: string | null;
  customerProfileId?: string | null;
  email?: string | null;
  document?: string | null;
  customerProfileStatus?: string | null;
  customerProfileSource?: string | null;
  sourceConnectionId?: string | null;
  registrationOrigin?: string | null;
  registrationStatus?: string | null;
  sharedProfile?: {
    profileId?: string | null;
    displayName?: string | null;
    origin?: string | null;
    lastContactAt?: string | null;
    currentContext?: string | null;
    presence?: {
      vendas?: {
        present?: boolean;
        status?: string | null;
      };
      atendimento?: {
        present?: boolean;
        route?: string | null;
      };
      recovery?: {
        present?: boolean;
        status?: string | null;
        openAmount?: number | null;
      };
    };
  } | null;
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
  recoveryRiskScore: number | null;
  recoveryTotalPaid: number;
  recoveryAutomationEnabled: boolean | null;
  sharedProfile?: Customer["sharedProfile"];
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
  outboundMessageId?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type InboxRecoveryPaymentSummary = {
  id: string;
  amount: number;
  status: string | null;
  lifecycle: string | null;
  chargeType: string | null;
  createdAt: string | null;
  paidAt: string | null;
  paymentUrl: string | null;
};

export type InboxConversation = {
  id: string;
  contact?: string | null;
  status: InboxStatus | string;
  assignedTo: string | null;
  botActive: boolean | null;
  humanAssigned: boolean | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastRealMessageAt?: string | null;
  whatsappConnectionSessionId?: string | null;
  sourcePhoneNormalized?: string | null;
  sourceTenantKey?: string | null;
  currentFlow: string | null;
  flowResult: string | null;
  routeTarget: InboxRouteTarget;
  routeReason: string;
  recoveryCustomerId: string | null;
  recoveryCustomerName: string | null;
  recoveryOpenAmount: number;
  recoveryRiskScore: number | null;
  recoveryTotalPaid: number;
  recoveryStatus: string | null;
  recoveryPaymentHistory: InboxRecoveryPaymentSummary[];
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

export type InboxBootstrapPayload = {
  conversations: InboxConversation[];
  selectedConversation: InboxConversation | null;
  providerWarning?: {
    code?: string | null;
    message?: string | null;
  } | null;
  whatsappSession?: {
    accessible?: boolean;
    reason?: string | null;
    mode?: "current" | "all" | string;
    currentSessionId?: string | null;
    providerHealth?: {
      status?: string | null;
      canSafelyDelete?: boolean | null;
      reason?: string | null;
      lastCheckedAt?: string | null;
      rawStatus?: string | null;
      rawError?: string | null;
    } | null;
    currentSession?: {
      id: string;
      provider?: string | null;
      phoneNormalized?: string | null;
      displayPhone?: string | null;
      connectedAt?: string | null;
    } | null;
  } | null;
  whatsappSessionCleanup?: {
    required?: boolean;
    currentSessionId?: string | null;
    oldSessionCount?: number;
    oldConversationCount?: number;
    oldMessageCount?: number;
    latestOldSession?: {
      id: string;
      phoneNormalized?: string | null;
      displayPhone?: string | null;
      status?: string | null;
      connectedAt?: string | null;
      disconnectedAt?: string | null;
      createdAt?: string | null;
    } | null;
  } | null;
};

export type MeticulousTrashPurgeCandidate = {
  conversationId: string;
  phone: string | null;
  action: "would_purge" | "purged" | "skipped" | string;
  reason: string | null;
  lastCustomerWords: string | null;
  detectedReason: string | null;
  confidence?: number | null;
};

export type MeticulousTrashPurgeJob = {
  jobId: string;
  status: "idle" | "running" | "paused" | "paused_provider_unhealthy" | "paused_after_restart" | "canceled" | "completed" | "failed" | string;
  mode: "dry_run" | "real" | string;
  dryRun: boolean;
  totalCandidates: number;
  currentIndex: number;
  currentConversationId: string | null;
  currentPhone: string | null;
  currentLastCustomerWords: string | null;
  currentDetectedReason: string | null;
  processed: number;
  markedNegative: number;
  purged: number;
  skipped: number;
  errors: Array<Record<string, unknown>>;
  candidates: MeticulousTrashPurgeCandidate[];
  nextRunAt: string | null;
  countdownSeconds: number;
  providerStatus: string | null;
  providerHealth: {
    status?: string | null;
    canSafelyDelete?: boolean | null;
    reason?: string | null;
    lastCheckedAt?: string | null;
  } | null;
  startedAt: string | null;
  finishedAt: string | null;
  olderThanHours: number;
  delayMs: number;
  limit: number | null;
};

export type InboxFullBootstrapPayload = {
  success: boolean;
  connected: boolean;
  engine: string | null;
  chatsSynced: number;
  contactsSynced: number;
  conversationsDiscovered: number;
  conversationsMirrored: number;
  messagesMirrored: number;
  mediaMessagesMirrored: number;
  pagesFetched: number;
  conversationsWithNames: number;
  conversationsWithAvatars: number;
  heavySync: boolean;
  message: string;
  error?: string | null;
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
  nextNodeId?: string;
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
  globalBotEnabled: boolean;
  checkRecoveryBeforeReply: boolean;
  autoRouteDebtorsToRecovery: boolean;
  autoReopenClosedConversation: boolean;
  notifyOnNewInbound: boolean;
};

export type AtendimentoBotType =
  | "vendas"
  | "atendimento"
  | "organizacao"
  | "recovery"
  | "prospeccao";

export type AtendimentoBotSetup = {
  completed: boolean;
  completedAt?: string | null;
  botType?: AtendimentoBotType | null;
  channelMode?: "QR" | "OFFICIAL" | null;
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

export type AtendimentoAgendaConnectionStatus = "not_linked" | "pending" | "connected";

export type AtendimentoAgendaGuideActionType =
  | "abrir_agenda"
  | "cancelar_agendamento"
  | "acao_customizada";

export type AtendimentoAgendaSendType = "botoes" | "lista";

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
  simpleMode?: boolean;
  capacityPerDay?: number;
  reminderMinutes?: number;
  noImmediateAvailabilityMessage: string;
  slots: AtendimentoAgendaSlot[];
};

export type AtendimentoAgendaConfig = {
  timezone: string;
  initialMessage: AtendimentoAgendaInitialMessage;
  flowMessages: AtendimentoAgendaFlowMessages;
  groups: AtendimentoAgendaGroup[];
  holidays: string[]; // ISO dates (YYYY-MM-DD) of holidays to exclude from availability
};

export type AtendimentoAgendaSimulationStage =
  | "abrir_guia"
  | "confirmar_agendamento"
  | "cancelar_agendamento";

export type AtendimentoAgendaSimulationPayload = {
  groupId: string;
  stage?: AtendimentoAgendaSimulationStage;
  selectedSlotId?: string;
  referenceDate?: string;
  customerName?: string;
  companyName?: string;
  attendantName?: string;
  hasActiveBooking?: boolean;
};

export type AtendimentoAgendaSimulationSlot = {
  id: string;
  label: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  isoDate: string;
};

export type AtendimentoAgendaSimulationMessage = {
  role: "bot" | "customer" | "system";
  label: string;
  text: string;
};

export type AtendimentoAgendaSimulationResult = {
  status: "ok" | "warning";
  stage: AtendimentoAgendaSimulationStage;
  groupId: string;
  groupTitle: string;
  actionType: AtendimentoAgendaGuideActionType;
  summary: string;
  messages: AtendimentoAgendaSimulationMessage[];
  suggestedSlots: AtendimentoAgendaSimulationSlot[];
  fallbackSlots: AtendimentoAgendaSimulationSlot[];
};

export const ATENDIMENTO_QUEUE_EVENT = "atendimento-human-queue";

export const META_TEMPLATES_REQUIRED_MESSAGE =
  "Templates oficiais exigem Meta WhatsApp Oficial.";

export const ATENDIMENTO_RECOVERY_ACTION_IDS = [
  "enter_recovery",
  "view_payments",
  "pay_now",
  "negotiate_debt",
  "continue_attendance",
] as const;

export function isAtendimentoRecoveryActionId(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  if ((ATENDIMENTO_RECOVERY_ACTION_IDS as readonly string[]).includes(normalized)) return true;
  return (
    normalized.includes("recovery") ||
    normalized.includes("payment") ||
    normalized.includes("payments") ||
    normalized.includes("debt") ||
    normalized.includes("financeiro") ||
    normalized.includes("financial")
  );
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

function resolveDefaultAtendimentoNextNodeId(actionIdRaw: string | null | undefined) {
  const actionId = String(actionIdRaw || "").trim().toLowerCase();
  switch (actionId) {
    case "talk_human":
      return "humanAckMessage";
    case "close_topic":
      return "closeTopicMessage";
    case "show_main_menu":
      return "mainMenuPrompt";
    case "enter_recovery":
      return "recoveryDetectedMessage";
    case "start_quick_registration":
      return "registrationCapture";
    case "view_payments":
      return "paymentHistory";
    case "pay_now":
      return "paymentAction";
    case "negotiate_debt":
      return "negotiationAction";
    case "continue_attendance":
      return "mainMenuPrompt";
    case "continue_journey":
      return "postActionPrompt";
    case "schedule_service":
      return "agendaDispatch";
    default:
      if (actionId.startsWith("agenda:")) return "agendaDispatch";
      return "postActionPrompt";
  }
}

function normalizeNextNodeId(value: string | null | undefined, actionId: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_:-]/g, "")
    .slice(0, 80);
  return normalized || resolveDefaultAtendimentoNextNodeId(actionId);
}

function makeDefaultButton(sectionKey: string, actionId: string, title: string, index: number): AtendimentoBotButton {
  return {
    buttonId: buildDefaultButtonId(sectionKey, actionId, index),
    actionId,
    title,
    nextNodeId: resolveDefaultAtendimentoNextNodeId(actionId),
  };
}

const DEFAULT_FIRST_CONTACT_SCENE_RULES: AtendimentoSceneRule[] = [
  {
    sceneId: "first_contact_rules_atendimento",
    conditionType: "first_contact_rules",
    enabled: true,
    metadata: {
      guideId: "atendimento",
      canInitiateConversation: false,
      messageIntervalSeconds: 18,
      nextContactDelayMinutes: 0,
      replyDelaySeconds: 22,
      typingSeconds: 5,
      typingVarianceSeconds: 4,
      maxFirstContactsPerHour: 0,
      quietHoursStart: "20:00",
      quietHoursEnd: "08:00",
      maxFollowUps: 1,
      followUpDelayHours: 6,
      requireOptIn: false,
      stopIntentKeywords: ["parar", "bloquear", "atendente", "reclamacao"],
      positiveIntentKeywords: ["suporte", "agenda", "financeiro", "ajuda"],
      optOutMessage: "Sem problema. Vou encerrar por aqui e deixo um atendente assumir se voce precisar.",
      handoffPolicy: "Se houver reclamacao, audio confuso ou pedido de humano, pausa o bot e coloca na fila Atendimento.",
    },
  },
  {
    sceneId: "first_contact_rules_prospeccao",
    conditionType: "first_contact_rules",
    enabled: true,
    metadata: {
      guideId: "prospeccao",
      canInitiateConversation: true,
      messageIntervalSeconds: 35,
      nextContactDelayMinutes: 12,
      replyDelaySeconds: 75,
      typingSeconds: 8,
      typingVarianceSeconds: 6,
      maxFirstContactsPerHour: 5,
      quietHoursStart: "18:30",
      quietHoursEnd: "09:00",
      maxFollowUps: 2,
      followUpDelayHours: 24,
      requireOptIn: false,
      stopIntentKeywords: ["nao tenho interesse", "nao quero", "pare", "remover", "spam"],
      positiveIntentKeywords: ["tenho interesse", "pode mandar", "quero saber", "me explica", "quanto custa"],
      optOutMessage: "Tudo bem, obrigado por responder. Nao vou insistir e encerro este contato por aqui.",
      handoffPolicy: "Se a pessoa demonstrar irritacao, pedir remocao ou responder negativamente duas vezes, encerra sem nova tentativa.",
    },
  },
  {
    sceneId: "first_contact_rules_recovery",
    conditionType: "first_contact_rules",
    enabled: true,
    metadata: {
      guideId: "recovery",
      canInitiateConversation: true,
      messageIntervalSeconds: 45,
      nextContactDelayMinutes: 8,
      replyDelaySeconds: 60,
      typingSeconds: 7,
      typingVarianceSeconds: 5,
      maxFirstContactsPerHour: 6,
      quietHoursStart: "19:00",
      quietHoursEnd: "09:00",
      maxFollowUps: 3,
      followUpDelayHours: 24,
      requireOptIn: true,
      stopIntentKeywords: ["nao reconheco", "ja paguei", "contestacao", "atendente", "pare"],
      positiveIntentKeywords: ["pagar", "pix", "boleto", "parcelar", "negociar"],
      optOutMessage: "Entendi. Vou pausar a cobranca automatica e deixar o atendimento humano verificar com cuidado.",
      handoffPolicy: "Contestacao, pagamento informado, tom irritado ou duvida sobre valor vai direto para humano antes de novo disparo.",
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
  variableCatalog: [
    {
      key: "cumprimentacao",
      label: "Cumprimentacao",
      example: "Bom dia",
      description: "Saudacao inteligente resolvida pelo horario local do atendimento.",
      scope: "shared",
      required: false,
    },
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
      actionId: "continue_journey",
      title: "Continuar atendimento",
      description: "Mantem o cliente dentro da jornada principal do Atendimento.",
      route: "atendimento",
      kind: "show_menu",
      enabled: true,
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
      title: "Abrir contexto financeiro",
      description: "Leva o cliente para o resumo financeiro dentro do fluxo principal do Atendimento.",
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
    {
      actionId: "view_payments",
      title: "Ver pagamentos",
      description: "Mostra pagamentos recentes e historico financeiro do cliente.",
      route: "recovery",
      kind: "reply",
      enabled: true,
      responseMessage: "Vou abrir o historico de pagamentos e continuar por aqui com voce.",
    },
    {
      actionId: "pay_now",
      title: "Pagar agora",
      description: "Gera link ou dispara a proxima acao financeira imediata.",
      route: "recovery",
      kind: "reply",
      enabled: true,
      responseMessage: "Perfeito. Vou gerar a acao financeira para voce seguir agora.",
    },
    {
      actionId: "negotiate_debt",
      title: "Negociar",
      description: "Registra uma negociacao sem tirar o cliente do fluxo principal.",
      route: "recovery",
      kind: "reply",
      enabled: true,
      responseMessage: "Vamos registrar uma negociacao e seguir pelo melhor caminho para o seu caso.",
    },
    {
      actionId: "continue_attendance",
      title: "Continuar atendimento",
      description: "Sai do contexto financeiro e devolve a conversa para a triagem principal.",
      route: "atendimento",
      kind: "show_menu",
      enabled: true,
    },
    {
      actionId: "schedule_service",
      title: "Agendar com Glauco",
      description: "Mostra dias livres da agenda simples do Glauco.",
      route: "atendimento",
      kind: "agenda",
      enabled: true,
      agendaGroupId: "agenda_glauco",
    },
    {
      actionId: "reschedule_service",
      title: "Reagendar atendimento",
      description: "Reagenda apenas quando existe agendamento futuro confirmado.",
      route: "atendimento",
      kind: "agenda",
      enabled: true,
      agendaGroupId: "agenda_glauco",
    },
    {
      actionId: "cancel_appointment",
      title: "Cancelar agendamento",
      description: "Cancela apenas quando existe agendamento futuro confirmado.",
      route: "atendimento",
      kind: "agenda",
      enabled: true,
      agendaGroupId: "agenda_glauco",
    },
    {
      actionId: "technical_support",
      title: "Suporte tecnico",
      description: "Coleta o problema tecnico antes de encaminhar.",
      route: "atendimento",
      kind: "reply",
      enabled: true,
      responseMessage: "Me conte em poucas palavras qual problema tecnico voce precisa resolver.",
    },
    {
      actionId: "talk_owner",
      title: "Falar direto com Glauco",
      description: "Pausa o bot e deixa a conversa para resposta direta do Glauco.",
      route: "atendimento",
      kind: "human_handoff",
      enabled: true,
    },
    {
      actionId: "supplier_contact",
      title: "Fornecedor / parceria",
      description: "Pausa o bot para avaliacao humana sem mandar para Vendas.",
      route: "atendimento",
      kind: "human_handoff",
      enabled: true,
    },
  ],
  routingRules: {
    globalBotEnabled: false,
    checkRecoveryBeforeReply: true,
    autoRouteDebtorsToRecovery: true,
    autoReopenClosedConversation: true,
    notifyOnNewInbound: true,
  },
  smartVariables: {
    greeting: {
      timezone: "America/Sao_Paulo",
      morning: "Bom dia",
      afternoon: "Boa tarde",
      night: "Boa noite",
      morningStartHour: 3,
      afternoonStartHour: 12,
      nightStartHour: 18,
    },
  },
  sceneRules: DEFAULT_FIRST_CONTACT_SCENE_RULES,
  welcomeMessage:
    "Ola, tudo bem?\nSou o atendimento da {{empresa}} e vou concluir seu cadastro rapido antes de seguir com a triagem principal.",
  welcomeButtons: [
    makeDefaultButton("welcome_message", "continue_journey", "Continuar atendimento", 0),
    makeDefaultButton("welcome_message", "talk_human", "Falar com atendente", 1),
  ],
  returningCustomerButtons: [
    makeDefaultButton("returning_customer", "continue_journey", "Continuar", 0),
    makeDefaultButton("returning_customer", "talk_human", "Falar com atendente", 1),
  ],
  mainMenuPrompt: "{{cumprimentacao}}! Sou o assistente da {{empresa}}.\nComo posso te ajudar?",
  mainMenuButtons: [
    makeDefaultButton("main_menu", "schedule_service", "Agendar com Glauco", 1),
    makeDefaultButton("main_menu", "technical_support", "Suporte tecnico", 2),
    makeDefaultButton("main_menu", "talk_owner", "Falar direto com Glauco", 3),
    makeDefaultButton("main_menu", "supplier_contact", "Fornecedor / parceria", 4),
  ],
  returningCustomerMessage:
    "Que bom te ver de novo, {{cliente}}. Vou continuar daqui e te mostrar o melhor caminho no Atendimento.",
  recoveryDetectedMessage:
    "Encontrei um valor pendente de {{valor_formatado}}. Posso te mostrar pagamentos, seguir com uma acao financeira ou continuar no Atendimento sem perder o contexto.",
  recoveryDetectedButtons: [
    makeDefaultButton("recovery_detected", "view_payments", "Ver pagamentos", 0),
    makeDefaultButton("recovery_detected", "pay_now", "Pagar agora", 1),
    makeDefaultButton("recovery_detected", "negotiate_debt", "Negociar", 2),
    makeDefaultButton("recovery_detected", "continue_attendance", "Continuar atendimento", 3),
    makeDefaultButton("recovery_detected", "talk_human", "Falar com atendente", 4),
    makeDefaultButton("recovery_detected", "schedule_service", "Agendar visita", 5),
  ],
  postActionPrompt: "Se precisar, posso continuar pelo Atendimento, voltar ao financeiro ou encaminhar para agenda e humano.",
  postActionButtons: [
    makeDefaultButton("post_action", "show_main_menu", "Voltar ao menu", 0),
    makeDefaultButton("post_action", "talk_human", "Atendimento humano", 1),
  ],
  humanAckMessage: "Perfeito. Vou encaminhar sua conversa para um atendente agora.",
  closeTopicMessage: "Entendido. Vou encerrar esta conversa por agora. Quando precisar, e so chamar.",
  blockedMessage: "Este contato esta bloqueado no Atendimento.",
};

const DEFAULT_BOT_AGENDA_GROUP: AtendimentoAgendaGroup = {
  id: "agenda_glauco",
  slug: "glauco",
  title: "Glauco",
  description: "Agenda simples para falar com o Glauco.",
  buttonLabel: "Agendar com Glauco",
  actionType: "abrir_agenda",
  linkedAgendaId: "agenda_glauco",
  customActionKey: null,
  sortOrder: 0,
  introMessage:
    "Tenho estas opções para falar com o Glauco:\n\n{{agenda_slots}}\n\nResponda com o número da melhor opção.",
  emptyMessage: "Não encontrei horário livre nos próximos dias. Vou deixar essa conversa para o Glauco ajustar manualmente.",
  linkedEmail: "",
  linkedUserName: "Glauco",
  connectionStatus: "not_linked",
  accentColor: "#4da36f",
  isActive: true,
  workdays: [1, 2, 3, 4, 5],
  visibleBusinessDays: 5,
  searchWindowDays: 14,
  suggestedSlotsCount: 5,
  fallbackFutureSlotsCount: 0,
  simpleMode: true,
  capacityPerDay: 1,
  reminderMinutes: 60,
  noImmediateAvailabilityMessage:
    "Não encontrei horário livre nos próximos dias. Vou deixar essa conversa para o Glauco ajustar manualmente.",
  slots: [
    {
      id: "agenda_glauco_0900_1300",
      label: "09:00-13:00",
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "13:00",
      enabled: true,
    },
  ],
};

export const DEFAULT_ATENDIMENTO_AGENDA_CONFIG: AtendimentoAgendaConfig = {
  timezone: "America/Sao_Paulo",
  initialMessage: {
    greeting: "Ola! Tudo bem?",
    companyLabel: "{{empresa}}",
    attendantLabel: "{{funcionario}}",
    introText:
      "Escolha abaixo a guia que faz mais sentido para o seu atendimento e eu vou sugerir os horarios disponiveis.",
    sendType: "botoes",
    fallbackText:
      "Se nenhuma guia fizer sentido agora, responda esta mensagem e um atendente continua por aqui.",
  },
  flowMessages: {
    availabilityIntro:
      "Esses sao os horarios que encontrei para {{agenda_nome}}. Escolha uma opcao para confirmar.",
    fallbackFutureSlots:
      "Nao encontrei horario imediato. Posso te oferecer as proximas opcoes futuras desta guia.",
    confirmationMessage:
      "Agendamento confirmado para {{agenda_nome}} em {{agenda_slots}}. Se precisar, voce pode cancelar pela propria jornada.",
    cancellationPrompt:
      "Localizei um agendamento ativo para {{agenda_nome}} em {{agenda_slots}}. Deseja cancelar agora?",
    cancellationSuccess:
      "Pronto. O agendamento de {{agenda_nome}} foi cancelado com sucesso.",
    cancellationNotFound:
      "Nao encontrei agendamento ativo para este cliente. Se quiser, posso te mostrar novas opcoes de horario.",
  },
  groups: [DEFAULT_BOT_AGENDA_GROUP],
  holidays: [],
};

const LEGACY_ATENDIMENTO_AGENDA_GROUPS: AtendimentoAgendaGroup[] = [
    {
      id: "agenda_tecnicos",
      slug: "tecnicos",
      title: "Tecnicos",
      description: "Horarios de manutencao e visitas tecnicas.",
      buttonLabel: "Tecnicos",
      actionType: "abrir_agenda",
      linkedAgendaId: "agenda_tecnicos",
      customActionKey: null,
      sortOrder: 0,
      introMessage:
        "Esses sao os horarios disponiveis para {{agenda_nome}}. Se quiser, um atendente pode confirmar o melhor encaixe.\n\n{{agenda_slots}}",
      emptyMessage: "No momento nao ha horarios ativos para essa agenda.",
      linkedEmail: "",
      linkedUserName: "",
      connectionStatus: "not_linked",
      accentColor: "#4da36f",
      isActive: true,
      workdays: [1, 2, 3, 4, 5],
      visibleBusinessDays: 7,
      searchWindowDays: 7,
      suggestedSlotsCount: 3,
      fallbackFutureSlotsCount: 3,
      noImmediateAvailabilityMessage:
        "Nao encontrei disponibilidade imediata para esta guia. Vou priorizar os proximos horarios futuros.",
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
    {
      id: "agenda_gerencia",
      slug: "gerencia",
      title: "Gerencia",
      description: "Espacos de alinhamento, aprovacao e retorno executivo.",
      buttonLabel: "Gerencia",
      actionType: "abrir_agenda",
      linkedAgendaId: "agenda_gerencia",
      customActionKey: null,
      sortOrder: 1,
      introMessage:
        "Essas sao as janelas abertas para {{agenda_nome}}. Escolha a melhor opcao e eu sigo com a confirmacao.\n\n{{agenda_slots}}",
      emptyMessage: "A gerencia nao abriu novos horarios nesta semana.",
      linkedEmail: "",
      linkedUserName: "",
      connectionStatus: "not_linked",
      accentColor: "#5d83ff",
      isActive: true,
      workdays: [1, 2, 3, 4, 5],
      visibleBusinessDays: 7,
      searchWindowDays: 7,
      suggestedSlotsCount: 3,
      fallbackFutureSlotsCount: 3,
      noImmediateAvailabilityMessage:
        "A gerencia nao tem horario imediato. Vou abrir os proximos encaixes futuros para escolha.",
      slots: [
        {
          id: "agenda_gerencia_ter_1000",
          label: "Terca 10:00-11:00",
          dayOfWeek: 2,
          startTime: "10:00",
          endTime: "11:00",
          enabled: true,
        },
        {
          id: "agenda_gerencia_qui_1500",
          label: "Quinta 15:00-16:30",
          dayOfWeek: 4,
          startTime: "15:00",
          endTime: "16:30",
          enabled: true,
        },
      ],
    },
    {
      id: "agenda_equipe",
      slug: "equipe",
      title: "Equipe",
      description: "Treinamentos, handoff e distribuicao da operacao.",
      buttonLabel: "Equipe",
      actionType: "abrir_agenda",
      linkedAgendaId: "agenda_equipe",
      customActionKey: null,
      sortOrder: 2,
      introMessage:
        "Esses horarios da {{agenda_nome}} ja estao liberados para atendimento.\n\n{{agenda_slots}}",
      emptyMessage: "A equipe ainda nao publicou novas faixas para este fluxo.",
      linkedEmail: "",
      linkedUserName: "",
      connectionStatus: "not_linked",
      accentColor: "#e57b47",
      isActive: true,
      workdays: [1, 2, 3, 4, 5],
      visibleBusinessDays: 7,
      searchWindowDays: 7,
      suggestedSlotsCount: 3,
      fallbackFutureSlotsCount: 3,
      noImmediateAvailabilityMessage:
        "A equipe nao publicou horario imediato. Vou te mostrar os proximos horarios futuros.",
      slots: [
        {
          id: "agenda_equipe_seg_0830",
          label: "Segunda 08:30-09:30",
          dayOfWeek: 1,
          startTime: "08:30",
          endTime: "09:30",
          enabled: true,
        },
        {
          id: "agenda_equipe_sex_1330",
          label: "Sexta 13:30-15:00",
          dayOfWeek: 5,
          startTime: "13:30",
          endTime: "15:00",
          enabled: true,
        },
      ],
    },
    {
      id: "agenda_cancelamento",
      slug: "cancelar_agendamento",
      title: "Cancelar agenda",
      description: "Guia especial para localizar e cancelar agendamentos ativos do cliente.",
      buttonLabel: "Cancelar agenda",
      actionType: "cancelar_agendamento",
      linkedAgendaId: "agenda_cancelamento",
      customActionKey: null,
      sortOrder: 3,
      introMessage:
        "Vou localizar o compromisso atual deste cliente e pedir a confirmacao do cancelamento.",
      emptyMessage: "Nao encontrei compromisso ativo para cancelar neste momento.",
      linkedEmail: "",
      linkedUserName: "",
      connectionStatus: "not_linked",
      accentColor: "#d05b42",
      isActive: true,
      workdays: [1, 2, 3, 4, 5],
      visibleBusinessDays: 7,
      searchWindowDays: 14,
      suggestedSlotsCount: 1,
      fallbackFutureSlotsCount: 0,
      noImmediateAvailabilityMessage:
        "Nao foi possivel localizar compromisso imediato para cancelamento.",
      slots: [],
    },
];
void LEGACY_ATENDIMENTO_AGENDA_GROUPS;

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

function normalizeHourCut(value: unknown, fallback: number) {
  const normalized = Math.trunc(Number(value));
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(0, Math.min(23, normalized));
}

function normalizeSmartVariables(value: unknown): AtendimentoSmartVariablesConfig {
  const greeting = (value as AtendimentoSmartVariablesConfig | undefined)?.greeting || {};
  const defaults = DEFAULT_ATENDIMENTO_BOT_CONFIG.smartVariables?.greeting || {};
  return {
    greeting: {
      timezone: String(greeting.timezone || defaults.timezone || "America/Sao_Paulo").trim(),
      morning: String(greeting.morning || defaults.morning || "Bom dia").trim(),
      afternoon: String(greeting.afternoon || defaults.afternoon || "Boa tarde").trim(),
      night: String(greeting.night || defaults.night || "Boa noite").trim(),
      morningStartHour: normalizeHourCut(greeting.morningStartHour, defaults.morningStartHour ?? 3),
      afternoonStartHour: normalizeHourCut(greeting.afternoonStartHour, defaults.afternoonStartHour ?? 12),
      nightStartHour: normalizeHourCut(greeting.nightStartHour, defaults.nightStartHour ?? 18),
    },
  };
}

function normalizeSceneRules(value: unknown): AtendimentoSceneRule[] {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item) => {
      const raw = item as Partial<AtendimentoSceneRule>;
      const sceneId = String(raw.sceneId || "").trim().toLowerCase();
      const conditionType = String(raw.conditionType || "").trim().toLowerCase();
      if (!sceneId || !conditionType) return null;
      const metadata =
        raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
          ? raw.metadata
          : undefined;
      return {
        sceneId,
        conditionType,
        enabled: Boolean(raw.enabled ?? true),
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
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "vendas") return "vendas";
  if (normalized === "atendimento") return "atendimento";
  if (normalized === "organizacao" || normalized === "organização" || normalized === "empresa") {
    return "organizacao";
  }
  if (normalized === "recovery") return "recovery";
  if (normalized === "prospeccao" || normalized === "prospecção") return "prospeccao";
  return null;
}

function normalizeSetupChannelMode(value: unknown): "QR" | "OFFICIAL" | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "QR" || normalized === "QRCODE" || normalized === "TEMPORARY") return "QR";
  if (normalized === "OFFICIAL" || normalized === "META") return "OFFICIAL";
  return null;
}

function normalizeSetupProvider(value: unknown): ChannelProvider | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "meta") return "meta";
  if (normalized === "evolution" || normalized === "qr" || normalized === "qrcode") return "evolution";
  return null;
}

function normalizeBotSetup(value: unknown): AtendimentoBotSetup {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    completed: Boolean(raw.completed),
    completedAt: String(raw.completedAt || "").trim() || null,
    botType: normalizeBotType(raw.botType),
    channelMode: normalizeSetupChannelMode(raw.channelMode),
    provider: normalizeSetupProvider(raw.provider),
    configuredFrom: String(raw.configuredFrom || "").trim() || null,
  };
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
    setup: normalizeBotSetup(payload?.setup),
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
          agendaGroupId:
            String(item.agendaGroupId || "").trim() ||
            (String(item.actionId || "").trim() === "schedule_service" ? "agenda_tecnicos" : null),
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
    returningCustomerButtons: normalizeButtons(
      payload?.returningCustomerButtons,
      DEFAULT_ATENDIMENTO_BOT_CONFIG.returningCustomerButtons,
      "returning_customer",
    ),
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
    smartVariables: normalizeSmartVariables(payload?.smartVariables),
    sceneRules: normalizeSceneRules(payload?.sceneRules),
  };
}

export function isAtendimentoBotSetupComplete(
  config: Partial<AtendimentoBotConfig> | null | undefined,
) {
  const normalized = normalizeBotConfig(config);
  const botType = normalized.setup.botType;
  return Boolean(
    normalized.setup.completed &&
      botType &&
      ["vendas", "atendimento", "organizacao", "prospeccao", "recovery"].includes(botType) &&
      String(normalized.mainMenuPrompt || "").trim().length >= 8 &&
      normalized.mainMenuButtons.length > 0,
  );
}

function isAtendimentoAgendaActionId(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "schedule_service" || normalized.startsWith("agenda:");
}

function isSanitizedRecoveryAction(action: AtendimentoBotActionGuide) {
  return (
    action.route === "recovery" ||
    action.kind === "recovery_handoff" ||
    isAtendimentoRecoveryActionId(action.actionId)
  );
}

function isSanitizedAgendaAction(action: AtendimentoBotActionGuide) {
  return action.kind === "agenda" || isAtendimentoAgendaActionId(action.actionId);
}

function sanitizeButtonListForAllowedActions(
  buttons: AtendimentoBotButton[],
  allowedActionIds: Set<string>,
  fallback: AtendimentoBotButton[] = [],
) {
  const sanitize = (items: AtendimentoBotButton[]) =>
    (items || [])
      .filter((button) => {
        const actionId = String(button.actionId || "").trim().toLowerCase();
        return actionId && allowedActionIds.has(actionId);
      })
      .map((button) => ({
        ...button,
        actionId: String(button.actionId || "").trim().toLowerCase(),
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
  const normalized = normalizeBotConfig(config);
  const recoveryEnabled = Boolean(options.recoveryEnabled);
  const providerCapabilities = options.providerCapabilities;
  const actionCatalog = normalized.actionCatalog.filter((action) => {
    if (!recoveryEnabled && isSanitizedRecoveryAction(action)) return false;
    if (!providerCapabilities.canUseAgendaBot && isSanitizedAgendaAction(action)) return false;
    return true;
  });
  const allowedActionIds = new Set(
    actionCatalog.map((action) => String(action.actionId || "").trim().toLowerCase()).filter(Boolean),
  );

  return {
    ...normalized,
    setup: {
      ...normalized.setup,
      provider: normalized.setup.provider || providerCapabilities.provider,
    },
    variableCatalog: recoveryEnabled
      ? normalized.variableCatalog
      : normalized.variableCatalog.filter((item) => item.scope !== "recovery"),
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

function normalizeButtons(
  buttons: AtendimentoBotButton[] | undefined,
  fallback: AtendimentoBotButton[],
  sectionKey: string,
): AtendimentoBotButton[] {
  if (buttons === undefined || buttons === null) {
    return fallback.map((button) => ({ ...button }));
  }
  const seen = new Set<string>();
  return buttons
    .map((button, index) => {
      const buttonId = normalizeButtonId(button.buttonId, buildDefaultButtonId(sectionKey, button.actionId, index));
      if (seen.has(buttonId)) return null;
      seen.add(buttonId);
      const nextNodeId = normalizeNextNodeId(
        String(button.nextNodeId || ""),
        String(button.actionId || ""),
      );
      return {
        buttonId,
        actionId: String(button.actionId || "").trim(),
        title: String(button.title || "").trim(),
        ...(nextNodeId ? { nextNodeId } : {}),
      };
    })
    .filter(
      (
        button,
      ): button is AtendimentoBotButton => Boolean(button && button.buttonId && button.actionId && button.title),
    );
}

function normalizeAgendaSendType(value: unknown): AtendimentoAgendaSendType {
  return String(value || "").trim().toLowerCase() === "lista" ? "lista" : "botoes";
}

function normalizeAgendaGuideActionType(value: unknown): AtendimentoAgendaGuideActionType {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "cancelar_agendamento") return "cancelar_agendamento";
  if (normalized === "acao_customizada") return "acao_customizada";
  return "abrir_agenda";
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_:-]/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function normalizeHolidayList(value: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => String(item || "").trim())
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)),
    ),
  ).sort();
}

function normalizeAgendaSlots(value: unknown, fallback: AtendimentoAgendaSlot[]) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item, index) => {
      const slot = item as Partial<AtendimentoAgendaSlot>;
      const rawId = String(slot.id || "").trim();
      const fallbackId = `agenda_slot_${index + 1}`;
      const id = rawId
        ? normalizeButtonId(rawId, fallbackId)
        : fallbackId;
      const startTime = /^\d{2}:\d{2}$/.test(String(slot.startTime || ""))
        ? String(slot.startTime)
        : "09:00";
      const endTime = /^\d{2}:\d{2}$/.test(String(slot.endTime || ""))
        ? String(slot.endTime)
        : "10:00";
      const dayOfWeek = Math.max(0, Math.min(6, Math.trunc(Number(slot.dayOfWeek || 0))));
      return {
        id,
        label: String(slot.label || `${startTime}-${endTime}`).trim(),
        dayOfWeek,
        startTime,
        endTime,
        enabled: slot.enabled ?? true,
      };
    })
    .filter((item) => item.id);
  return normalized.length ? normalized : fallback.map((item) => ({ ...item }));
}

export function normalizeAgendaConfig(
  payload: Partial<AtendimentoAgendaConfig> | null | undefined,
): AtendimentoAgendaConfig {
  const config = payload || {};
  const groupsInput = Array.isArray(config.groups) ? config.groups : [];
  const groups = groupsInput
    .map((group, index) => {
      const fallback =
        DEFAULT_ATENDIMENTO_AGENDA_CONFIG.groups[index] || DEFAULT_ATENDIMENTO_AGENDA_CONFIG.groups[0];
      const id = normalizeButtonId(String(group.id || ""), `agenda_group_${index + 1}`);
      const linkedEmail = String(group.linkedEmail || fallback?.linkedEmail || "").trim().toLowerCase();
      const requestedConnectionStatus = String(group.connectionStatus || fallback?.connectionStatus || "not_linked");
      const connectionStatus: AtendimentoAgendaConnectionStatus =
        requestedConnectionStatus === "pending" || requestedConnectionStatus === "connected"
          ? linkedEmail
            ? "pending"
            : "not_linked"
          : "not_linked";
      return {
        id,
        slug: normalizeAgendaSlug(group.slug, fallback?.slug || id),
        title: String(group.title || fallback?.title || `Agenda ${index + 1}`).trim(),
        description: String(group.description || fallback?.description || "").trim(),
        buttonLabel: String(group.buttonLabel || fallback?.buttonLabel || "Abrir agenda").trim(),
        actionType: normalizeAgendaGuideActionType(group.actionType ?? fallback?.actionType),
        linkedAgendaId:
          normalizeButtonId(String(group.linkedAgendaId || ""), fallback?.linkedAgendaId || id) || id,
        customActionKey: String(group.customActionKey || fallback?.customActionKey || "").trim() || null,
        sortOrder: normalizePositiveRange(group.sortOrder, fallback?.sortOrder ?? index, 0, 999),
        introMessage: String(group.introMessage || fallback?.introMessage || "").trim(),
        emptyMessage: String(group.emptyMessage || fallback?.emptyMessage || "").trim(),
        linkedEmail,
        linkedUserName: String(group.linkedUserName || fallback?.linkedUserName || "").trim(),
        connectionStatus,
        accentColor: String(group.accentColor || fallback?.accentColor || "#4da36f").trim() || "#4da36f",
        isActive: group.isActive ?? fallback?.isActive ?? true,
        workdays: normalizeAgendaWorkdays(
          group.workdays,
          Array.from(
            new Set(
              Array.isArray(group.slots)
                ? group.slots
                    .map((slot) => Math.trunc(Number(slot.dayOfWeek)))
                    .filter((day) => Number.isFinite(day) && day >= 0 && day <= 6)
                : fallback?.workdays || [1, 2, 3, 4, 5],
            ),
          ),
        ),
        visibleBusinessDays: normalizeVisibleBusinessDays(
          group.visibleBusinessDays,
          fallback?.visibleBusinessDays || 7,
        ),
        searchWindowDays: normalizePositiveRange(
          group.searchWindowDays,
          fallback?.searchWindowDays || fallback?.visibleBusinessDays || 7,
          1,
          30,
        ),
        suggestedSlotsCount: normalizePositiveRange(
          group.suggestedSlotsCount,
          fallback?.suggestedSlotsCount || 3,
          1,
          10,
        ),
        fallbackFutureSlotsCount: normalizePositiveRange(
          group.fallbackFutureSlotsCount,
          fallback?.fallbackFutureSlotsCount || 3,
          0,
          10,
        ),
        simpleMode: group.simpleMode ?? fallback?.simpleMode ?? false,
        capacityPerDay: normalizePositiveRange(group.capacityPerDay, fallback?.capacityPerDay || 1, 1, 20),
        reminderMinutes: normalizePositiveRange(group.reminderMinutes, fallback?.reminderMinutes || 60, 0, 1440),
        noImmediateAvailabilityMessage: String(
          group.noImmediateAvailabilityMessage ||
            fallback?.noImmediateAvailabilityMessage ||
            fallback?.emptyMessage ||
            "",
        ).trim(),
        slots: normalizeAgendaSlots(group.slots, fallback?.slots || []),
      };
    })
    .filter((group) => group.id);

  return {
    timezone: String(config.timezone || DEFAULT_ATENDIMENTO_AGENDA_CONFIG.timezone).trim(),
    initialMessage: {
      greeting: String(
        config.initialMessage?.greeting || DEFAULT_ATENDIMENTO_AGENDA_CONFIG.initialMessage.greeting,
      ).trim(),
      companyLabel: String(
        config.initialMessage?.companyLabel || DEFAULT_ATENDIMENTO_AGENDA_CONFIG.initialMessage.companyLabel,
      ).trim(),
      attendantLabel: String(
        config.initialMessage?.attendantLabel || DEFAULT_ATENDIMENTO_AGENDA_CONFIG.initialMessage.attendantLabel,
      ).trim(),
      introText: String(
        config.initialMessage?.introText || DEFAULT_ATENDIMENTO_AGENDA_CONFIG.initialMessage.introText,
      ).trim(),
      sendType: normalizeAgendaSendType(
        config.initialMessage?.sendType ?? DEFAULT_ATENDIMENTO_AGENDA_CONFIG.initialMessage.sendType,
      ),
      fallbackText: String(
        config.initialMessage?.fallbackText || DEFAULT_ATENDIMENTO_AGENDA_CONFIG.initialMessage.fallbackText,
      ).trim(),
    },
    flowMessages: {
      availabilityIntro: String(
        config.flowMessages?.availabilityIntro ||
          DEFAULT_ATENDIMENTO_AGENDA_CONFIG.flowMessages.availabilityIntro,
      ).trim(),
      fallbackFutureSlots: String(
        config.flowMessages?.fallbackFutureSlots ||
          DEFAULT_ATENDIMENTO_AGENDA_CONFIG.flowMessages.fallbackFutureSlots,
      ).trim(),
      confirmationMessage: String(
        config.flowMessages?.confirmationMessage ||
          DEFAULT_ATENDIMENTO_AGENDA_CONFIG.flowMessages.confirmationMessage,
      ).trim(),
      cancellationPrompt: String(
        config.flowMessages?.cancellationPrompt ||
          DEFAULT_ATENDIMENTO_AGENDA_CONFIG.flowMessages.cancellationPrompt,
      ).trim(),
      cancellationSuccess: String(
        config.flowMessages?.cancellationSuccess ||
          DEFAULT_ATENDIMENTO_AGENDA_CONFIG.flowMessages.cancellationSuccess,
      ).trim(),
      cancellationNotFound: String(
        config.flowMessages?.cancellationNotFound ||
          DEFAULT_ATENDIMENTO_AGENDA_CONFIG.flowMessages.cancellationNotFound,
      ).trim(),
    },
    holidays: normalizeHolidayList(config.holidays),
    groups:
      groups.length > 0
        ? groups.sort((left, right) => left.sortOrder - right.sortOrder)
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
  const metadata =
    message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
      ? (message.metadata as Record<string, unknown>)
      : null;
  const type = String(metadata?.normalizedMessageType || message.messageType || "text")
    .trim()
    .toLowerCase();
  const fileName = String(metadata?.fileName || "").trim();
  if (type === "deleted" || metadata?.isDeleted) return "[Mensagem apagada]";
  if (type === "image") return "[Imagem recebida]";
  if (type === "audio") return fileName ? `[Audio] ${fileName}` : "[Audio recebido]";
  if (type === "document") return fileName ? `[Documento] ${fileName}` : "[Documento recebido]";
  if (type === "video") return "[Video recebido]";
  if (type === "sticker") return "[Figurinha recebida]";
  if (type === "reaction") return "[Reacao recebida]";
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
    .filter((slot) => slot.enabled && (group.workdays || []).includes(slot.dayOfWeek))
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

/**
 * Fetch Brazilian holidays from public API or return empty array if unavailable
 * Returns ISO date strings (YYYY-MM-DD)
 */
export async function fetchBrazilianHolidays(year: number): Promise<string[]> {
  try {
    // Using a public API for Brazilian holidays
    const response = await fetch(`https://api.iseatz.com/holidays?country=BR&year=${year}`);
    if (!response.ok) throw new Error("API request failed");
    
    const data = (await response.json()) as Array<{ date: string; name?: string }>;
    if (!Array.isArray(data)) return [];
    
    return data
      .map((item) => {
        // Extract just the date part (YYYY-MM-DD)
        const dateStr = String(item.date || "").split("T")[0];
        return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : null;
      })
      .filter((date): date is string => date !== null)
      .sort();
  } catch (error) {
    console.warn("Failed to fetch holidays from API:", error);
    return [];
  }
}

/**
 * Check if a date is a holiday (must be ISO date string YYYY-MM-DD)
 */
export function isHoliday(date: string, holidays: string[]): boolean {
  return holidays.includes(date);
}
