"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ChatActionButton,
  ChatActionGrid,
  ChatAvatar,
  ChatBadge,
  ChatComposer,
  ChatDockPanel,
  ChatEmptyState,
  ChatFieldNote,
  ChatIconButton,
  ChatMessageBubble,
  ChatQueue,
  ChatQueueItem,
  ChatSideGrid,
  ChatInfoCard,
  ChatThread,
} from "@/components/chat/PremiumChat";
import DashboardScaffold from "@/components/DashboardScaffold";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import type {
  WorkspacePanelDescriptor,
} from "@/components/workspace/types";
import {
  SHARED_CONVERSATION_WORKSPACE_IDS,
  SHARED_CONVERSATION_WORKSPACE_MODULE_KEY,
  createSharedConversationWorkspaceLayout,
} from "@/components/workspace/conversation-workspace";
import { acquirePopupTopbarLock } from "@/lib/popup-visibility";
import { apiFetch } from "../_lib/api";
import { startSmartPolling } from "../_lib/polling";
import { useRequireAuth } from "../_lib/useRequireAuth";
import AgendaPanel from "./_components/AgendaPanel";
import BotPanel from "./_components/BotPanel";
import {
  ATENDIMENTO_QUEUE_EVENT,
  DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  DEFAULT_ATENDIMENTO_BOT_CONFIG,
  buildAgendaActionId,
  createCustomAction,
  fetchBrazilianHolidays,
  formatCurrency,
  getMessagePreview,
  normalizeAgendaConfig,
  normalizeBotConfig,
  type AtendimentoAgendaConfig,
  type AtendimentoAgendaSimulationPayload,
  type AtendimentoAgendaSimulationResult,
  type AtendimentoBotActionGuide,
  type AtendimentoBotButton,
  type AtendimentoBotConfig,
  type AtendimentoBotVariableScope,
  type AtendimentoCustomer,
  type InboxConversation,
  type InboxMessage,
} from "./inbox-model";
import styles from "./page.module.css";
import recoveryStyles from "@/app/hbx-recovery/page.module.css";

type InboxTab = "messages" | "customers" | "agenda";
type InboxQueue = "all" | "closed" | "blocked";
type StatusFilter = "all" | "new" | "open" | "closed" | "blocked";
type BotTextField =
  | "welcomeMessage"
  | "returningCustomerMessage"
  | "mainMenuPrompt"
  | "recoveryDetectedMessage"
  | "postActionPrompt"
  | "humanAckMessage"
  | "closeTopicMessage"
  | "blockedMessage";

type NoticeState = {
  tone: "success" | "error";
  text: string;
};

type InboxAlertKind = "human_queue" | "new_message";

type ActionOption = {
  value: string;
  label: string;
};

type AgendaGroupEditableField =
  | "title"
  | "slug"
  | "description"
  | "buttonLabel"
  | "actionType"
  | "linkedAgendaId"
  | "customActionKey"
  | "sortOrder"
  | "introMessage"
  | "emptyMessage"
  | "noImmediateAvailabilityMessage"
  | "linkedEmail"
  | "linkedUserName"
  | "connectionStatus"
  | "accentColor"
  | "isActive"
  | "workdays"
  | "visibleBusinessDays"
  | "searchWindowDays"
  | "suggestedSlotsCount"
  | "fallbackFutureSlotsCount";

type CurrentUserProfile = {
  id?: number | null;
  username?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  isSystemMaster?: boolean;
  company?: {
    id?: number | null;
    name?: string | null;
  } | null;
};

type ConversationStatusTone = "bot" | "human" | "recovery" | "blocked" | "closed";

const ATENDIMENTO_PENDING_STORAGE_KEY = "atendimentoPendingHumanCount";

const TAB_ITEMS: Array<{ id: InboxTab; label: string; description: string }> = [
  {
    id: "messages",
    label: "Chat",
    description: "Operacao principal de chat com fila, historico e resposta humana.",
  },
  {
    id: "customers",
    label: "Tabela de clientes",
    description: "Leitura consolidada por telefone, com rota e prioridade operacional.",
  },
  {
    id: "agenda",
    label: "Agenda",
    description: "Guias cadastraveis, agenda semanal e vinculo por e-mail para cada frente.",
  },
];

const ACTION_KIND_LABELS: Record<AtendimentoBotActionGuide["kind"], string> = {
  reply: "Responder",
  human_handoff: "Humano",
  recovery_handoff: "Recovery",
  close: "Encerrar",
  show_menu: "Mostrar menu",
  agenda: "Agenda",
};

function makeClientId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveAtendimentoButtonNextNodeId(actionIdRaw: string | null | undefined) {
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
    default:
      if (actionId.startsWith("agenda:")) return "agendaDispatch";
      return "postActionPrompt";
  }
}

function normalizeAtendimentoNextNodeId(value: string | null | undefined, actionId: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_:-]/g, "")
    .slice(0, 80);
  return normalized || resolveAtendimentoButtonNextNodeId(actionId);
}

function formatDateLabel(dateStr: string | null | undefined, mounted: boolean) {
  if (!dateStr) return "-";
  const parsed = new Date(dateStr);
  if (!mounted) return parsed.toISOString();
  return parsed.toLocaleString("pt-BR");
}

function formatTimeLabel(dateStr: string | null | undefined, mounted: boolean) {
  if (!dateStr) return "-";
  const parsed = new Date(dateStr);
  if (!mounted) return parsed.toISOString();
  return parsed.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function getInboxConversationFreshness(conversation?: Pick<InboxConversation, "updatedAt" | "messages"> | null) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const newestMessage = messages.length <= 1 ? messages[0] : messages[messages.length - 1];
  return String(newestMessage?.createdAt || conversation?.updatedAt || "").trim();
}

function shouldReloadInboxConversation(
  summary?: InboxConversation | null,
  detail?: InboxConversation | null,
) {
  if (!summary) return false;
  if (!detail) return true;
  if (summary.id !== detail.id) return true;
  return getInboxConversationFreshness(summary) !== getInboxConversationFreshness(detail);
}

function mergeInboxConversationSummary(
  summary?: InboxConversation | null,
  detail?: InboxConversation | null,
) {
  if (!summary && !detail) return null;
  if (!summary) return detail || null;
  if (!detail || detail.id !== summary.id) return summary;
  return {
    ...detail,
    ...summary,
    messages:
      Array.isArray(detail.messages) && detail.messages.length > 0
        ? detail.messages
        : summary.messages,
  };
}

function mapConversationToneToChatTone(tone: ConversationStatusTone) {
  if (tone === "human") return "success" as const;
  if (tone === "recovery") return "amber" as const;
  if (tone === "blocked") return "danger" as const;
  if (tone === "closed") return "muted" as const;
  return "brand" as const;
}

function mapInboxBubbleTone(message: InboxMessage) {
  const direction = String(message.direction || "").trim().toLowerCase();
  const senderType = String(message.senderType || "").trim().toLowerCase();
  if (senderType === "system") return "system" as const;
  if (senderType === "human") return "human" as const;
  if (direction === "outbound") return "outbound" as const;
  return "inbound" as const;
}

function removeButtonFromSections(config: AtendimentoBotConfig, actionId: string): AtendimentoBotConfig {
  return {
    ...config,
    welcomeButtons: config.welcomeButtons.filter((button) => button.actionId !== actionId),
    returningCustomerButtons: config.returningCustomerButtons.filter(
      (button) => button.actionId !== actionId,
    ),
    mainMenuButtons: config.mainMenuButtons.filter((button) => button.actionId !== actionId),
    recoveryDetectedButtons: config.recoveryDetectedButtons.filter(
      (button) => button.actionId !== actionId,
    ),
    postActionButtons: config.postActionButtons.filter((button) => button.actionId !== actionId),
  };
}

function getConversationStatusMeta(conversation: InboxConversation): {
  label: string;
  shortLabel: string;
  tone: ConversationStatusTone;
} {
  if (conversation.status === "blocked" || conversation.isBlocked) {
    return { label: "Bloqueado", shortLabel: "BLQ", tone: "blocked" };
  }
  if (conversation.routeTarget === "recovery") {
    return { label: "Recovery", shortLabel: "REC", tone: "recovery" };
  }
  if (conversation.status === "open") {
    return { label: "Humano", shortLabel: "HUM", tone: "human" };
  }
  if (conversation.status === "closed") {
    return { label: "Resolvido", shortLabel: "OK", tone: "closed" };
  }
  return { label: "No bot", shortLabel: "BOT", tone: "bot" };
}

export default function InboxClientPage() {
  const hasToken = useRequireAuth();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<InboxTab>("messages");
  const [inboxQueue, setInboxQueue] = useState<InboxQueue>("all");
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<InboxConversation | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loadingBot, setLoadingBot] = useState(true);
  const [savingBot, setSavingBot] = useState(false);
  const [loadingAgenda, setLoadingAgenda] = useState(true);
  const [savingAgenda, setSavingAgenda] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [botStudioOpen, setBotStudioOpen] = useState(false);
  const [agendaStudioOpen, setAgendaStudioOpen] = useState(false);
  const [botConfig, setBotConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [agendaConfig, setAgendaConfig] = useState<AtendimentoAgendaConfig>(
    DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  );
  const [currentUserProfile, setCurrentUserProfile] = useState<CurrentUserProfile | null>(null);
  const [expandedAlerts, setExpandedAlerts] = useState<Record<InboxAlertKind | "system_notice", boolean>>({
    human_queue: false,
    new_message: false,
    system_notice: false,
  });
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<InboxAlertKind, boolean>>({
    human_queue: false,
    new_message: false,
  });
  const previousHumanCountRef = useRef(0);
  const previousNewCountRef = useRef(0);
  const humanAlertTimerRef = useRef<number | null>(null);
  const newAlertTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const chatTimelineRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const selectedConversationRef = useRef<InboxConversation | null>(null);

  const [atendimentoCustomers, setAtendimentoCustomers] = useState<AtendimentoCustomer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState({ phone: "", name: "", route: "atendimento", notes: "" });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<AtendimentoCustomer | null>(null);
  const [promoteForm, setPromoteForm] = useState({ openAmount: "", saleDate: "", companyName: "" });
  const [savingPromotion, setSavingPromotion] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!botStudioOpen && !agendaStudioOpen) return;
    const releaseTopbarLock = acquirePopupTopbarLock();
    return releaseTopbarLock;
  }, [botStudioOpen, agendaStudioOpen]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation, selectedId]);

  const loadConversation = useCallback(async (id: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoadingConversation(true);
    try {
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${id}`);
      setSelectedConversation(data);
      setSelectedId(data.id);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar conversa.";
      setError(message);
    } finally {
      if (!silent) setLoadingConversation(false);
    }
  }, []);

  const loadConversations = useCallback(
    async (options?: { preferredId?: string | null; silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoadingList(true);
      setError(null);
      try {
        const data = await apiFetch<InboxConversation[]>("/inbox/conversations");
        setConversations(data);

        const preferredId = options?.preferredId ?? selectedIdRef.current;
        const selectedSummary =
          preferredId ? data.find((conversation) => conversation.id === preferredId) || null : null;
        const fallbackSummary = data[0] ?? null;
        const nextSummary = selectedSummary || fallbackSummary;
        const nextId = nextSummary?.id ?? null;

        if (nextId !== selectedIdRef.current) {
          setSelectedId(nextId);
        }

        const mergedConversation = mergeInboxConversationSummary(
          nextSummary,
          selectedConversationRef.current?.id === nextId
            ? selectedConversationRef.current
            : null,
        );

        if (mergedConversation) {
          setSelectedConversation(mergedConversation);
        } else if (!nextId) {
          setSelectedConversation(null);
        }

        if (nextId && shouldReloadInboxConversation(nextSummary, selectedConversationRef.current)) {
          void loadConversation(nextId, { silent: true });
        } else if (nextSummary && selectedConversationRef.current?.id === nextId) {
          setSelectedConversation((current) =>
            current && current.id === nextId
              ? {
                  ...current,
                  ...nextSummary,
                  messages: current.messages,
                }
              : current,
          );
        } else {
          setSelectedConversation(null);
        }
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Falha ao carregar conversas.";
        setError(message);
      } finally {
        if (!silent) setLoadingList(false);
      }
    },
    [loadConversation],
  );

  const loadBotConfig = useCallback(async () => {
    setLoadingBot(true);
    try {
      const data = await apiFetch<AtendimentoBotConfig>("/inbox/bot-config");
      setBotConfig(normalizeBotConfig(data));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar editor.";
      setError(message);
    } finally {
      setLoadingBot(false);
    }
  }, []);

  const loadAgendaConfig = useCallback(async () => {
    setLoadingAgenda(true);
    try {
      const data = await apiFetch<AtendimentoAgendaConfig>("/inbox/agenda");
      setAgendaConfig(normalizeAgendaConfig(data));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar agenda.";
      setError(message);
    } finally {
      setLoadingAgenda(false);
    }
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const data = await apiFetch<CurrentUserProfile>("/profile/current-user");
      setCurrentUserProfile(data || null);
    } catch {
      setCurrentUserProfile(null);
    }
  }, []);

  const loadAtendimentoCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const data = await apiFetch<AtendimentoCustomer[]>("/inbox/customers");
      setAtendimentoCustomers(data ?? []);
    } catch {
      // non-fatal
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken === false) return;
    void loadConversations();
    return startSmartPolling(() => loadConversations({ silent: true }), {
      intervalMs: 10000,
      immediate: false,
    });
  }, [hasToken, loadConversations]);

  useEffect(() => {
    if (hasToken === false) return;
    void Promise.all([loadBotConfig(), loadAgendaConfig(), loadCurrentUser()]);
  }, [hasToken, loadAgendaConfig, loadBotConfig, loadCurrentUser]);

  useEffect(() => {
    if (hasToken === false) return;
    if (activeTab === "customers") void loadAtendimentoCustomers();
  }, [activeTab, hasToken, loadAtendimentoCustomers]);

  const filteredConversations = useMemo(() => {
    if (inboxQueue === "closed") {
      return conversations.filter((conversation) => conversation.status === "closed");
    }
    if (inboxQueue === "blocked") {
      return conversations.filter(
        (conversation) => conversation.status === "blocked" || conversation.isBlocked,
      );
    }
    return conversations.filter(
      (conversation) => conversation.status !== "closed" && conversation.status !== "blocked" && !conversation.isBlocked,
    );
  }, [conversations, inboxQueue]);

  useEffect(() => {
    if (activeTab !== "messages") return;

    const currentConversationId = selectedConversation?.id ?? selectedId ?? null;
    const nextConversation = currentConversationId
      ? filteredConversations.find((conversation) => conversation.id === currentConversationId) || null
      : null;

    if (nextConversation) {
      if (selectedId !== nextConversation.id) {
        setSelectedId(nextConversation.id);
      }
      return;
    }

    const fallbackConversation = filteredConversations[0] ?? null;
    if (!fallbackConversation) {
      if (selectedId !== null) setSelectedId(null);
      if (selectedConversation !== null) setSelectedConversation(null);
      return;
    }

    if (selectedId === fallbackConversation.id || loadingConversation) return;
    void loadConversation(fallbackConversation.id);
  }, [
    activeTab,
    filteredConversations,
    loadConversation,
    loadingConversation,
    selectedConversation,
    selectedId,
  ]);

  const pendingAtendimentoConversations = useMemo(
    () =>
      [...conversations]
        .filter(
          (conversation) =>
            conversation.routeTarget === "atendimento" &&
            (conversation.status === "new" || conversation.status === "open"),
        )
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
        ),
    [conversations],
  );

  const pendingAtendimentoCount = pendingAtendimentoConversations.length;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ATENDIMENTO_PENDING_STORAGE_KEY, String(pendingAtendimentoCount));
    } catch {
      // ignore storage errors
    }

    try {
      window.dispatchEvent(
        new CustomEvent<{ count: number }>(ATENDIMENTO_QUEUE_EVENT, {
          detail: { count: pendingAtendimentoCount },
        }),
      );
    } catch {
      // ignore event dispatch errors
    }
  }, [pendingAtendimentoCount]);

  const humanAttentionConversations = useMemo(
    () => pendingAtendimentoConversations.filter((conversation) => conversation.status === "open"),
    [pendingAtendimentoConversations],
  );

  const newInboundConversations = useMemo(
    () => pendingAtendimentoConversations.filter((conversation) => conversation.status === "new"),
    [pendingAtendimentoConversations],
  );

  const actionOptions = useMemo(() => {
    const options = new Map<string, ActionOption>();

    for (const action of botConfig.actionCatalog) {
      options.set(action.actionId, {
        value: action.actionId,
        label: `${action.title} • ${ACTION_KIND_LABELS[action.kind] || action.kind}`,
      });
    }

    for (const group of agendaConfig.groups) {
      const actionId = buildAgendaActionId(group.id);
      options.set(actionId, {
        value: actionId,
        label: `Agenda • ${group.title}`,
      });
    }

    [
      ...botConfig.welcomeButtons,
      ...botConfig.returningCustomerButtons,
      ...botConfig.mainMenuButtons,
      ...botConfig.recoveryDetectedButtons,
      ...botConfig.postActionButtons,
    ].forEach((button) => {
      if (!options.has(button.actionId)) {
        options.set(button.actionId, {
          value: button.actionId,
          label: `Acao atual • ${button.actionId}`,
        });
      }
    });

    return Array.from(options.values());
  }, [
    agendaConfig.groups,
    botConfig.actionCatalog,
    botConfig.mainMenuButtons,
    botConfig.postActionButtons,
    botConfig.recoveryDetectedButtons,
    botConfig.returningCustomerButtons,
    botConfig.welcomeButtons,
  ]);

  const agendaOptions = useMemo(
    () => agendaConfig.groups.map((group) => ({ id: group.id, title: group.title })),
    [agendaConfig.groups],
  );

  const canManageAgenda = useMemo(() => {
    if (currentUserProfile?.isSystemMaster) return true;
    const role = String(currentUserProfile?.role || "").trim().toUpperCase();
    return role === "ADMIN" || role === "GERENTE";
  }, [currentUserProfile?.isSystemMaster, currentUserProfile?.role]);

  const selectedStatus = selectedConversation?.status ?? "new";
  const selectedRouteIsRecovery = selectedConversation?.routeTarget === "recovery";
  const selectedBlocked = Boolean(selectedConversation?.isBlocked);
  const selectedConversationMetadata =
    (selectedConversation?.metadata as Record<string, unknown> | null | undefined) ?? null;
  const selectedConversationDisplayName =
    selectedConversation?.customer.name ||
    String(
      selectedConversationMetadata?.waNickname ||
        selectedConversationMetadata?.whatsappName ||
        selectedConversationMetadata?.whatsappProfileName ||
        "",
    ).trim() ||
    selectedConversation?.customer.phone ||
    "";
  const selectedConversationStatusMeta = selectedConversation
    ? getConversationStatusMeta(selectedConversation)
    : null;
  const humanAttentionPreview = humanAttentionConversations[0] || null;
  const newInboundPreview = newInboundConversations[0] || null;
  const humanQueueLabel = `${humanAttentionConversations.length} mensagem${
    humanAttentionConversations.length === 1 ? "" : "s"
  }`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const summaryParts = [
      `Atendimento na aba ${activeTab}`,
      botStudioOpen ? "editor do bot aberto" : "editor do bot fechado",
      agendaStudioOpen ? "agenda aberta" : "agenda fechada",
      selectedConversation?.customer?.name
        ? `conversa selecionada com ${selectedConversation.customer.name}`
        : selectedId
          ? `conversa selecionada ${selectedId}`
          : "sem conversa selecionada",
    ];
    if (selectedConversation?.routeTarget) {
      summaryParts.push(`rota ${selectedConversation.routeTarget}`);
    }
    if (selectedBlocked) {
      summaryParts.push("contato bloqueado");
    }

    window.dispatchEvent(
      new CustomEvent("hbx-tech-assistant:page-context", {
        detail: {
          moduleKey: "atendimento",
          route: "/dashboard/inbox",
          summary: summaryParts.join(", "),
          tags: [
            activeTab,
            selectedStatus,
            selectedConversation?.routeTarget || "sem_rota",
            botStudioOpen ? "editor_aberto" : "editor_fechado",
            agendaStudioOpen ? "agenda_aberta" : "agenda_fechada",
            selectedBlocked ? "bloqueado" : "ativo",
          ],
          details: {
            activeTab,
            selectedConversationId: selectedId || null,
            selectedConversationName: selectedConversation?.customer?.name || null,
            selectedConversationPhone: selectedConversation?.customer?.phone || null,
            selectedStatus,
            selectedRoute: selectedConversation?.routeTarget || null,
            selectedBlocked,
            loadingConversation,
            loadingBot,
            savingBot,
            loadingAgenda,
            savingAgenda,
            botStudioOpen,
            agendaStudioOpen,
            humanAttentionCount: humanAttentionConversations.length,
            newInboundCount: newInboundConversations.length,
            conversationsCount: conversations.length,
          },
        },
      }),
    );
  }, [
    activeTab,
    botStudioOpen,
    agendaStudioOpen,
    conversations.length,
    humanAttentionConversations.length,
    loadingAgenda,
    loadingBot,
    loadingConversation,
    newInboundConversations.length,
    savingAgenda,
    savingBot,
    selectedBlocked,
    selectedConversation?.customer?.name,
    selectedConversation?.customer?.phone,
    selectedConversation?.routeTarget,
    selectedId,
    selectedStatus,
  ]);

  const handleTabChange = useCallback((nextTab: InboxTab) => {
    setActiveTab(nextTab);
    if (nextTab === "agenda") {
      setAgendaStudioOpen(true);
      setBotStudioOpen(false);
      return;
    }
    setAgendaStudioOpen(false);
  }, []);

  const renderAgendaPanel = () => (
    <AgendaPanel
      agendaConfig={agendaConfig}
      loadingAgenda={loadingAgenda}
      savingAgenda={savingAgenda}
      currentUserEmail={String(currentUserProfile?.email || "")}
      currentUserName={String(currentUserProfile?.name || "")}
      currentUserRole={String(currentUserProfile?.role || "")}
      canManageAgenda={canManageAgenda}
      onAddGroup={addAgendaGroup}
      onMoveGroup={moveAgendaGroup}
      onRemoveGroup={removeAgendaGroup}
      onLinkCurrentUser={linkAgendaToCurrentUser}
      onSave={() => {
        setNotice(null);
        void saveAgenda();
      }}
      onUpdateGroup={updateAgendaGroup}
      onAddSlot={addAgendaSlot}
      onRemoveSlot={removeAgendaSlot}
      onUpdateSlot={updateAgendaSlot}
      onUpdateHolidays={updateAgendaHolidays}
      onLoadHolidays={loadAgendaHolidaysFromAPI}
      onUpdateInitialMessage={updateAgendaInitialMessage}
      onUpdateFlowMessage={updateAgendaFlowMessage}
      onSimulate={simulateAgendaFlow}
    />
  );

  const updateStatus = useCallback(
    async (status: Exclude<StatusFilter, "all" | "blocked">) => {
      if (!selectedId) return;
      setError(null);
      try {
        const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        setSelectedConversation(data);
        setNotice({ tone: "success", text: `Conversa atualizada para ${status}.` });
        await loadConversations({ preferredId: data.id, silent: true });
      } catch (updateError) {
        const message =
          updateError instanceof Error ? updateError.message : "Falha ao atualizar status.";
        setError(message);
      }
    },
    [loadConversations, selectedId],
  );

  const blockConversation = useCallback(async () => {
    if (!selectedId) return;
    const reason = window.prompt(
      "Motivo do bloqueio:",
      selectedConversation?.blockedReason || "Bloqueado manualmente pelo operador.",
    );
    if (reason === null) return;
    setError(null);
    try {
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/block`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
      setSelectedConversation(data);
      setNotice({ tone: "success", text: "Contato bloqueado no Atendimento." });
      await loadConversations({ preferredId: data.id, silent: true });
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Falha ao bloquear contato.";
      setError(message);
    }
  }, [loadConversations, selectedConversation?.blockedReason, selectedId]);

  const unblockConversation = useCallback(async () => {
    if (!selectedId) return;
    setError(null);
    try {
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/unblock`, {
        method: "PATCH",
      });
      setSelectedConversation(data);
      setNotice({ tone: "success", text: "Contato desbloqueado no Atendimento." });
      await loadConversations({ preferredId: data.id, silent: true });
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : "Falha ao desbloquear contato.";
      setError(message);
    }
  }, [loadConversations, selectedId]);

  const sendMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedId || !sendText.trim() || selectedRouteIsRecovery || selectedBlocked) return;
      setSending(true);
      setError(null);
      try {
        const data = await apiFetch<InboxConversation>(`/inbox/conversations/${selectedId}/message`, {
          method: "POST",
          body: JSON.stringify({ content: sendText.trim() }),
        });
        setSendText("");
        setSelectedConversation(data);
        setNotice({ tone: "success", text: "Mensagem manual enfileirada com sucesso." });
        await loadConversations({ preferredId: data.id, silent: true });
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "Falha ao enviar mensagem.";
        setError(message);
      } finally {
        setSending(false);
      }
    },
    [loadConversations, selectedBlocked, selectedId, selectedRouteIsRecovery, sendText],
  );

  const inboxWorkspacePanels: WorkspacePanelDescriptor[] = useMemo(
    () => [
      {
        id: SHARED_CONVERSATION_WORKSPACE_IDS.listPanel,
        title: "Conversas",
        description: "Fila principal de atendimento com troca rápida de contexto.",
        component: SHARED_CONVERSATION_WORKSPACE_IDS.listComponent,
        params: {
          accent: "#2563eb",
        },
        minimumWidth: 300,
        minimumHeight: 240,
        initialWidth: 360,
      },
      {
        id: SHARED_CONVERSATION_WORKSPACE_IDS.mainPanel,
        title: "Chat",
        description: "Historico principal, contexto e leitura operacional.",
        component: SHARED_CONVERSATION_WORKSPACE_IDS.mainComponent,
        params: {
          accent: "#0f766e",
        },
        minimumWidth: 540,
        minimumHeight: 320,
        initialWidth: 760,
      },
      {
        id: SHARED_CONVERSATION_WORKSPACE_IDS.composerPanel,
        title: "Resposta",
        description: "Resposta manual com crescimento vertical livre.",
        component: SHARED_CONVERSATION_WORKSPACE_IDS.composerComponent,
        params: {
          accent: "#1d4ed8",
        },
        minimumWidth: 520,
        minimumHeight: 220,
        initialHeight: 260,
      },
      {
        id: SHARED_CONVERSATION_WORKSPACE_IDS.contextPanel,
        title: "Cliente / Recovery",
        description: "Cliente, status, rota e ações rápidas de operação.",
        component: SHARED_CONVERSATION_WORKSPACE_IDS.contextComponent,
        params: {
          accent: "#b45309",
        },
        minimumWidth: 320,
        minimumHeight: 260,
        initialWidth: 360,
      },
    ],
    [],
  );

  const inboxWorkspaceComponents = useMemo(
    () => ({
      [SHARED_CONVERSATION_WORKSPACE_IDS.listComponent]: () => (
        <ChatDockPanel
          eyebrow="Atendimento"
          title="Fila"
          description="Conversas ativas, prioridade e rota em uma unica leitura."
          count={filteredConversations.length}
          className={styles.workspaceDockPanel}
          bodyClassName={styles.workspaceDockBody}
        >
          {loadingList ? (
            <ChatEmptyState title="Carregando conversas">A fila sera montada assim que a leitura inicial terminar.</ChatEmptyState>
          ) : filteredConversations.length === 0 ? (
            <ChatEmptyState title="Nenhuma conversa encontrada">Ajuste o filtro ou aguarde novas mensagens entrarem na fila.</ChatEmptyState>
          ) : (
            <ChatQueue className={styles.conversationList}>
              {filteredConversations.map((conversation) => {
                const active = conversation.id === selectedId;
                const latestMessage = conversation.messages?.[0];
                const statusMeta = getConversationStatusMeta(conversation);
                return (
                  <ChatQueueItem
                    key={conversation.id}
                    active={active}
                    onClick={() => loadConversation(conversation.id)}
                    initials={String(conversation.customer.name || conversation.customer.phone).slice(0, 2).toUpperCase()}
                    label={statusMeta.shortLabel}
                    tone={mapConversationToneToChatTone(statusMeta.tone)}
                    title={conversation.customer.name || conversation.customer.phone}
                    subtitle={conversation.customer.phone}
                    preview={getMessagePreview(latestMessage)}
                    meta={formatTimeLabel(conversation.updatedAt, mounted)}
                    badges={
                      <>
                        <ChatBadge tone="brand">{statusMeta.label}</ChatBadge>
                        {conversation.routeTarget === "recovery" ? (
                          <ChatBadge tone="warning">Recovery</ChatBadge>
                        ) : null}
                        {conversation.status === "blocked" || conversation.isBlocked ? (
                          <ChatBadge tone="danger">Bloqueado</ChatBadge>
                        ) : null}
                      </>
                    }
                  />
                );
              })}
            </ChatQueue>
          )}
        </ChatDockPanel>
      ),
      [SHARED_CONVERSATION_WORKSPACE_IDS.mainComponent]: () => (
        <ChatDockPanel
          eyebrow="Chat"
          title={selectedConversation ? selectedConversationDisplayName : "Chat"}
          description="Historico principal do atendimento."
          count={selectedConversation?.messages.length || 0}
          className={styles.workspaceDockPanel}
          bodyClassName={styles.workspaceDockBody}
        >
          {loadingConversation ? (
            <ChatEmptyState title="Carregando conversa">Preparando historico e contexto do cliente.</ChatEmptyState>
          ) : !selectedConversation ? (
            <ChatEmptyState title="Nenhuma conversa selecionada">Escolha uma conversa na fila para abrir o chat.</ChatEmptyState>
          ) : (
            <ChatThread
              avatar={
                <ChatAvatar
                  initials={String(selectedConversationDisplayName).slice(0, 2).toUpperCase()}
                  label={selectedConversationStatusMeta?.shortLabel || "BOT"}
                  tone={mapConversationToneToChatTone(selectedConversationStatusMeta?.tone || "bot")}
                />
              }
              title={selectedConversationDisplayName}
              subtitle={selectedConversation.customer.phone}
              badges={
                <>
                  <ChatBadge tone="teal">{selectedConversationStatusMeta?.label || "Ativo"}</ChatBadge>
                  {selectedConversation.routeTarget === "recovery" ? (
                    <ChatBadge tone="warning">Rota recovery</ChatBadge>
                  ) : null}
                  {selectedConversation.recoveryOpenAmount > 0 ? (
                    <ChatBadge tone="brand">{formatCurrency(selectedConversation.recoveryOpenAmount)}</ChatBadge>
                  ) : null}
                </>
              }
              actions={
                <ChatIconButton
                  icon="gear"
                  label="Editor"
                  onClick={() => setBotStudioOpen(true)}
                  title="Configurar automacao"
                  aria-label="Configurar automacao"
                />
              }
            >
              <div ref={chatTimelineRef} className={styles.chatTimeline}>
                {selectedConversation.messages.length === 0 ? (
                  <ChatEmptyState title="Sem mensagens">Esta conversa ainda nao tem historico registrado.</ChatEmptyState>
                ) : (
                  selectedConversation.messages.map((message) => (
                    <ChatMessageBubble
                      key={message.id}
                      tone={mapInboxBubbleTone(message)}
                      sender={
                        String(message.senderType || "").trim().toLowerCase() === "human"
                          ? "Humano"
                          : String(message.senderType || "").trim().toLowerCase() === "system"
                            ? "Sistema"
                            : String(message.direction || "").trim().toLowerCase() === "outbound"
                              ? "HBX"
                              : "Cliente"
                      }
                      messageType={String(message.messageType || "texto").replace(/_/g, " ")}
                      meta={formatDateLabel(message.createdAt, mounted)}
                    >
                      <p>{getMessagePreview(message)}</p>
                    </ChatMessageBubble>
                  ))
                )}
              </div>
            </ChatThread>
          )}
        </ChatDockPanel>
      ),
      [SHARED_CONVERSATION_WORKSPACE_IDS.composerComponent]: () => (
        <ChatDockPanel
          eyebrow="Resposta"
          title="Resposta manual"
          description="Escreva, ajuste e envie sem apertar o historico."
          count={sendText.trim().length}
          className={styles.workspaceDockPanel}
          bodyClassName={`${styles.workspaceDockBody} ${styles.workspaceDockComposerBody}`}
        >
          {!selectedConversation ? (
            <ChatEmptyState title="Resposta indisponivel">Selecione uma conversa para abrir o composer.</ChatEmptyState>
          ) : (
            <form className={styles.workspaceDockComposer} onSubmit={sendMessage}>
              <ChatComposer
                title="Responder ao cliente"
                description="Mensagem humana com resize vertical livre."
                toolbar={
                  <>
                    <ChatIconButton icon="spark" title="Contexto do atendimento" aria-label="Contexto do atendimento" />
                    <ChatIconButton icon="send" title="Pronto para enviar" aria-label="Pronto para enviar" />
                  </>
                }
                footer={
                  <>
                    <ChatFieldNote>
                      {selectedRouteIsRecovery
                        ? "Esta conversa tambem aparece no Recovery."
                        : "O bot pode retomar a conversa depois do encerramento."}
                    </ChatFieldNote>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={sending || !sendText.trim() || selectedBlocked}
                    >
                      {sending ? "Enviando..." : "Enviar resposta"}
                    </button>
                  </>
                }
              >
                <textarea
                  id="atendimento-chat-reply"
                  name="atendimentoChatReply"
                  className="field"
                  rows={6}
                  value={sendText}
                  onChange={(event) => setSendText(event.target.value)}
                  placeholder={
                    selectedBlocked
                      ? "Contato bloqueado. Desbloqueie para responder."
                      : "Digite uma resposta manual..."
                  }
                  disabled={selectedBlocked || sending}
                />
              </ChatComposer>
            </form>
          )}
        </ChatDockPanel>
      ),
      [SHARED_CONVERSATION_WORKSPACE_IDS.contextComponent]: () => (
        <ChatDockPanel
          eyebrow="Contexto"
          title="Cliente / Recovery"
          description="Status, rota e acoes do atendimento."
          count={selectedConversation ? "LIVE" : "--"}
          className={styles.workspaceDockPanel}
          bodyClassName={styles.workspaceDockBody}
        >
          {!selectedConversation ? (
            <ChatEmptyState title="Sem contexto ativo">Abra uma conversa para liberar os atalhos operacionais.</ChatEmptyState>
          ) : (
            <ChatSideGrid>
              <ChatInfoCard title="Resumo do cliente" meta={selectedConversation.routeTarget || "atendimento"}>
                <p><strong>Cliente:</strong> {selectedConversationDisplayName}</p>
                <p><strong>Telefone:</strong> {selectedConversation.customer.phone}</p>
                <p><strong>Status:</strong> {selectedConversationStatusMeta?.label ?? "-"}</p>
                <p><strong>Motivo:</strong> {selectedConversation.routeReason || "-"}</p>
                <p><strong>Atualizado:</strong> {formatDateLabel(selectedConversation.updatedAt, mounted)}</p>
                {selectedConversation.recoveryOpenAmount > 0 ? (
                  <p><strong>Recovery:</strong> {formatCurrency(selectedConversation.recoveryOpenAmount)}</p>
                ) : null}
                {selectedBlocked ? (
                  <p>
                    <strong>Bloqueio:</strong> {formatDateLabel(selectedConversation.blockedAt, mounted)}
                    {selectedConversation.blockedReason ? ` - ${selectedConversation.blockedReason}` : ""}
                  </p>
                ) : null}
              </ChatInfoCard>

              <ChatInfoCard title="Acoes rapidas" meta="Operacao">
                <ChatActionGrid>
                  {selectedConversation.routeTarget === "recovery" ? (
                    <Link href="/hbx-recovery?tab=messages" className="btn btn-primary btn-sm">
                      Abrir Recovery
                    </Link>
                  ) : null}
                  {selectedConversation.routeTarget === "recovery" ? (
                    <Link href="/hbx-recovery?tab=payments" className="btn btn-secondary btn-sm">
                      Ver pagamentos
                    </Link>
                  ) : null}
                  {selectedConversation.routeTarget === "recovery" ? (
                    <Link href="/hbx-recovery?tab=templates" className="btn btn-secondary btn-sm">
                      Templates Meta
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setBotStudioOpen(true)}
                  >
                    Abrir automacao
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setActiveTab("agenda");
                      setAgendaStudioOpen(true);
                      setBotStudioOpen(false);
                    }}
                  >
                    Abrir agenda
                  </button>
                  {!selectedBlocked ? (
                    <>
                      <ChatActionButton
                        type="button"
                        className={`btn btn-sm ${selectedStatus === "open" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => updateStatus("open")}
                      >
                        Assumir humano
                      </ChatActionButton>
                      <ChatActionButton
                        type="button"
                        className={`btn btn-sm ${selectedStatus === "new" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => updateStatus("new")}
                      >
                        Voltar ao bot
                      </ChatActionButton>
                      <ChatActionButton
                        type="button"
                        className={`btn btn-sm ${selectedStatus === "closed" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => updateStatus("closed")}
                      >
                        Encerrar conversa
                      </ChatActionButton>
                    </>
                  ) : null}
                  {selectedBlocked ? (
                    <ChatActionButton type="button" className="btn btn-secondary btn-sm" onClick={unblockConversation}>
                      Desbloquear contato
                    </ChatActionButton>
                  ) : (
                    <ChatActionButton type="button" className="btn btn-danger btn-sm" onClick={blockConversation}>
                      Bloquear contato
                    </ChatActionButton>
                  )}
                </ChatActionGrid>
              </ChatInfoCard>
            </ChatSideGrid>
          )}
        </ChatDockPanel>
      ),
    }),
    [
      blockConversation,
      filteredConversations,
      loadConversation,
      loadingConversation,
      loadingList,
      mounted,
      selectedBlocked,
      selectedConversation,
      selectedConversationDisplayName,
      selectedConversationStatusMeta,
      selectedId,
      selectedRouteIsRecovery,
      selectedStatus,
      sendMessage,
      sendText,
      sending,
      unblockConversation,
      updateStatus,
    ],
  );

  const addAgendaGroup = useCallback(() => {
    setAgendaConfig((current) => ({
      ...current,
      groups: [
        ...current.groups,
        {
          id: makeClientId("agenda_group"),
          slug: `nova_guia_${current.groups.length + 1}`,
          title: `Nova guia ${current.groups.length + 1}`,
          description: "Explique rapidamente quando esse time deve ser usado.",
          buttonLabel: "Nova guia",
          actionType: "abrir_agenda",
          linkedAgendaId: "",
          customActionKey: null,
          sortOrder: current.groups.length,
          introMessage:
            "Esses sao os horarios disponiveis para {{agenda_nome}}.\n\n{{agenda_slots}}",
          emptyMessage: "No momento nao ha horarios ativos para essa agenda.",
          noImmediateAvailabilityMessage:
            "Nao encontrei disponibilidade imediata para esta guia. Vou priorizar os proximos horarios futuros.",
          linkedEmail: String(currentUserProfile?.email || "").trim().toLowerCase(),
          linkedUserName: String(currentUserProfile?.name || "").trim(),
          connectionStatus: currentUserProfile?.email ? "pending" : "not_linked",
          accentColor: ["#4da36f", "#5d83ff", "#e57b47", "#9b59b6"][current.groups.length % 4],
          isActive: true,
          workdays: [1, 2, 3, 4, 5],
          visibleBusinessDays: 7,
          searchWindowDays: 7,
          suggestedSlotsCount: 3,
          fallbackFutureSlotsCount: 3,
          slots: [],
        },
      ],
    }));
  }, [currentUserProfile?.email, currentUserProfile?.name]);

  const removeAgendaGroup = useCallback((groupId: string) => {
    const actionId = buildAgendaActionId(groupId);
    setAgendaConfig((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
    }));
    setBotConfig((current) => {
      const next = removeButtonFromSections(current, actionId);
      return {
        ...next,
        actionCatalog: next.actionCatalog.map((action) =>
          action.agendaGroupId === groupId ? { ...action, agendaGroupId: null } : action,
        ),
      };
    });
  }, []);

  const updateAgendaGroup = useCallback(
    (
      groupId: string,
      field: AgendaGroupEditableField,
      value: string | boolean | number | number[],
    ) => {
      setAgendaConfig((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId ? { ...group, [field]: value } : group,
        ),
      }));
    },
    [],
  );

  const moveAgendaGroup = useCallback((groupId: string, direction: -1 | 1) => {
    setAgendaConfig((current) => {
      const index = current.groups.findIndex((group) => group.id === groupId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.groups.length) return current;
      const groups = [...current.groups];
      const [group] = groups.splice(index, 1);
      groups.splice(nextIndex, 0, group);
      return {
        ...current,
        groups: groups.map((item, itemIndex) => ({
          ...item,
          sortOrder: itemIndex,
        })),
      };
    });
  }, []);

  const linkAgendaToCurrentUser = useCallback(
    (groupId: string) => {
      const email = String(currentUserProfile?.email || "").trim().toLowerCase();
      if (!email) return;
      setAgendaConfig((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                linkedEmail: email,
                linkedUserName: String(currentUserProfile?.name || "").trim(),
                connectionStatus: "connected",
              }
            : group,
        ),
      }));
    },
    [currentUserProfile?.email, currentUserProfile?.name],
  );

  const addAgendaSlot = useCallback((groupId: string) => {
    setAgendaConfig((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              slots: [
                ...group.slots,
                {
                  id: makeClientId(`${groupId}_slot`),
                  label: "Novo horario",
                  dayOfWeek: 1,
                  startTime: "09:00",
                  endTime: "10:00",
                  enabled: true,
                },
              ],
            }
          : group,
      ),
    }));
  }, []);

  const removeAgendaSlot = useCallback((groupId: string, slotId: string) => {
    setAgendaConfig((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? { ...group, slots: group.slots.filter((slot) => slot.id !== slotId) }
          : group,
      ),
    }));
  }, []);

  const updateAgendaSlot = useCallback(
    (
      groupId: string,
      slotId: string,
      field: "label" | "dayOfWeek" | "startTime" | "endTime" | "enabled",
      value: string | number | boolean,
    ) => {
      setAgendaConfig((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                slots: group.slots.map((slot) =>
                  slot.id === slotId ? { ...slot, [field]: value } : slot,
                ),
              }
            : group,
        ),
      }));
    },
    [],
  );

  const updateAgendaHolidays = useCallback((holidays: string[]) => {
    setAgendaConfig((current) => ({
      ...current,
      holidays: holidays.sort(),
    }));
  }, []);

  const updateAgendaInitialMessage = useCallback(
    (
      field: keyof AtendimentoAgendaConfig["initialMessage"],
      value: string,
    ) => {
      setAgendaConfig((current) => ({
        ...current,
        initialMessage: {
          ...current.initialMessage,
          [field]: value,
        },
      }));
    },
    [],
  );

  const updateAgendaFlowMessage = useCallback(
    (
      field: keyof AtendimentoAgendaConfig["flowMessages"],
      value: string,
    ) => {
      setAgendaConfig((current) => ({
        ...current,
        flowMessages: {
          ...current.flowMessages,
          [field]: value,
        },
      }));
    },
    [],
  );

  const loadAgendaHolidaysFromAPI = useCallback(async () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    try {
      const holidays = await fetchBrazilianHolidays(currentYear);
      if (holidays.length === 0) {
        setError("Nenhum feriado encontrado para o ano atual.");
        return;
      }
      setAgendaConfig((current) => ({
        ...current,
        holidays: Array.from(new Set([...current.holidays, ...holidays])).sort(),
      }));
      setNotice({ tone: "success", text: `${holidays.length} feriados carregados com sucesso.` });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar feriados.";
      setError(message);
    }
  }, []);

  const saveAgenda = useCallback(async () => {
    setSavingAgenda(true);
    setError(null);
    try {
      const payload = await apiFetch<AtendimentoAgendaConfig>("/inbox/agenda", {
        method: "PATCH",
        body: JSON.stringify(agendaConfig),
      });
      setAgendaConfig(normalizeAgendaConfig(payload));
      setNotice({ tone: "success", text: "Agenda salva com sucesso." });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Falha ao salvar agenda.";
      setError(message);
    } finally {
      setSavingAgenda(false);
    }
  }, [agendaConfig]);

  const simulateAgendaFlow = useCallback(
    async (payload: AtendimentoAgendaSimulationPayload) => {
      return apiFetch<AtendimentoAgendaSimulationResult>("/inbox/agenda/simulate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    [],
  );

  const updateRoutingRule = useCallback(
    (field: keyof AtendimentoBotConfig["routingRules"], value: boolean) => {
      setBotConfig((current) => ({
        ...current,
        routingRules: {
          ...current.routingRules,
          [field]: value,
        },
      }));
    },
    [],
  );

  const appendVariable = useCallback(
    (field: keyof AtendimentoBotConfig, variableKey: string) => {
      const allowedFields: BotTextField[] = [
        "welcomeMessage",
        "returningCustomerMessage",
        "mainMenuPrompt",
        "recoveryDetectedMessage",
        "postActionPrompt",
        "humanAckMessage",
        "closeTopicMessage",
        "blockedMessage",
      ];
      if (!allowedFields.includes(field as BotTextField)) return;
      setBotConfig((current) => {
        const safeField = field as BotTextField;
        const currentValue = String(current[safeField] || "");
        const suffix =
          currentValue && !currentValue.endsWith(" ") && !currentValue.endsWith("\n") ? " " : "";
        return {
          ...current,
          [safeField]: `${currentValue}${suffix}{{${variableKey}}}`,
        };
      });
    },
    [],
  );

  const updateBotText = useCallback((field: BotTextField, value: string) => {
    setBotConfig((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const updateButtonSection = useCallback(
    (
      section:
        | "welcomeButtons"
        | "returningCustomerButtons"
        | "mainMenuButtons"
        | "recoveryDetectedButtons"
        | "postActionButtons",
      index: number,
      field: keyof AtendimentoBotButton,
      value: string,
    ) => {
      setBotConfig((current) => ({
        ...current,
        [section]: current[section].map((button, buttonIndex) =>
          buttonIndex === index
            ? (() => {
                const currentActionId =
                  field === "actionId" ? String(value || "") : String(button.actionId || "");
                return {
                  ...button,
                  [field]:
                    field === "buttonId"
                      ? String(value || "")
                          .trim()
                          .toLowerCase()
                          .replace(/\s+/g, "_")
                          .replace(/[^a-z0-9_:-]/g, "")
                          .slice(0, 80)
                      : field === "nextNodeId"
                        ? normalizeAtendimentoNextNodeId(value, currentActionId)
                        : value,
                  nextNodeId:
                    field === "actionId"
                      ? resolveAtendimentoButtonNextNodeId(value)
                      : field === "nextNodeId"
                        ? normalizeAtendimentoNextNodeId(value, currentActionId)
                        : normalizeAtendimentoNextNodeId(String(button.nextNodeId || ""), currentActionId),
                };
              })()
            : button,
        ),
      }));
    },
    [],
  );

  const addButtonSection = useCallback(
    (
      section:
        | "welcomeButtons"
        | "returningCustomerButtons"
        | "mainMenuButtons"
        | "recoveryDetectedButtons"
        | "postActionButtons",
    ) => {
      const fallback = actionOptions[0] || { value: "talk_human", label: "Falar com atendente" };
      setBotConfig((current) => ({
        ...current,
        [section]: [
          ...current[section],
          {
            buttonId: makeClientId(`${section}_button`),
            actionId: fallback.value,
            title: fallback.label.split(" • ")[0],
            nextNodeId: resolveAtendimentoButtonNextNodeId(fallback.value),
          },
        ],
      }));
    },
    [actionOptions],
  );

  const removeButtonSection = useCallback(
    (
      section:
        | "welcomeButtons"
        | "returningCustomerButtons"
        | "mainMenuButtons"
        | "recoveryDetectedButtons"
        | "postActionButtons",
      index: number,
    ) => {
      setBotConfig((current) => ({
        ...current,
        [section]: current[section].filter((_, buttonIndex) => buttonIndex !== index),
      }));
    },
    [],
  );

  const updateActionGuide = useCallback(
    (
      actionId: string,
      field:
        | "title"
        | "description"
        | "route"
        | "kind"
        | "enabled"
        | "responseMessage"
        | "agendaGroupId",
      value: string | boolean,
    ) => {
      setBotConfig((current) => ({
        ...current,
        actionCatalog: current.actionCatalog.map((action) => {
          if (action.actionId !== actionId) return action;
          if (field === "enabled") return { ...action, enabled: Boolean(value) };
          if (field === "route") {
            return { ...action, route: value as AtendimentoBotVariableScope };
          }
          if (field === "kind") {
            const nextKind = value as AtendimentoBotActionGuide["kind"];
            return {
              ...action,
              kind: nextKind,
              agendaGroupId: nextKind === "agenda" ? action.agendaGroupId || null : null,
              responseMessage: nextKind === "reply" ? action.responseMessage || "" : "",
            };
          }
          if (field === "agendaGroupId") {
            return {
              ...action,
              agendaGroupId: String(value || "").trim() || null,
            };
          }
          if (field === "responseMessage") {
            return {
              ...action,
              responseMessage: String(value || ""),
            };
          }
          return {
            ...action,
            [field]: String(value || ""),
          };
        }),
      }));
    },
    [],
  );

  const addCustomAction = useCallback(() => {
    setBotConfig((current) => ({
      ...current,
      actionCatalog: [...current.actionCatalog, createCustomAction(current)],
    }));
  }, []);

  const removeCustomAction = useCallback((actionId: string) => {
    setBotConfig((current) => {
      const next = removeButtonFromSections(current, actionId);
      return {
        ...next,
        actionCatalog: next.actionCatalog.filter((action) => action.actionId !== actionId),
      };
    });
  }, []);

  const saveBot = useCallback(async () => {
    setSavingBot(true);
    setError(null);
    try {
      const payload = await apiFetch<AtendimentoBotConfig>("/inbox/bot-config", {
        method: "PATCH",
        body: JSON.stringify(botConfig),
      });
      setBotConfig(normalizeBotConfig(payload));
      setNotice({ tone: "success", text: "Editor do bot salvo com sucesso." });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Falha ao salvar editor.";
      setError(message);
    } finally {
      setSavingBot(false);
    }
  }, [botConfig]);

  function scheduleAlertCollapse(
    key: InboxAlertKind | "system_notice",
    timerRef: { current: number | null },
  ) {
    if (typeof window === "undefined") return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setExpandedAlerts((current) => ({ ...current, [key]: false }));
    }, 5000);
  }

  useEffect(() => {
    if (!selectedConversation || !chatTimelineRef.current) return;
    if (typeof window === "undefined") return;
    const timeline = chatTimelineRef.current;
    window.requestAnimationFrame(() => {
      timeline.scrollTop = timeline.scrollHeight;
    });
  }, [selectedConversation, selectedConversation?.id, selectedConversation?.messages.length]);

  useEffect(() => {
    if (humanAlertTimerRef.current !== null) {
      window.clearTimeout(humanAlertTimerRef.current);
      humanAlertTimerRef.current = null;
    }
    if (humanAttentionConversations.length === 0) {
      setExpandedAlerts((current) => ({ ...current, human_queue: false }));
      setDismissedAlerts((current) => ({ ...current, human_queue: false }));
      previousHumanCountRef.current = 0;
      return;
    }
    if (humanAttentionConversations.length > previousHumanCountRef.current) {
      setDismissedAlerts((current) => ({ ...current, human_queue: false }));
      setExpandedAlerts((current) => ({ ...current, human_queue: true }));
      scheduleAlertCollapse("human_queue", humanAlertTimerRef);
    }
    previousHumanCountRef.current = humanAttentionConversations.length;
  }, [humanAttentionConversations.length]);

  useEffect(() => {
    if (newAlertTimerRef.current !== null) {
      window.clearTimeout(newAlertTimerRef.current);
      newAlertTimerRef.current = null;
    }
    if (newInboundConversations.length === 0) {
      setExpandedAlerts((current) => ({ ...current, new_message: false }));
      setDismissedAlerts((current) => ({ ...current, new_message: false }));
      previousNewCountRef.current = 0;
      return;
    }
    if (newInboundConversations.length > previousNewCountRef.current) {
      setDismissedAlerts((current) => ({ ...current, new_message: false }));
      setExpandedAlerts((current) => ({ ...current, new_message: true }));
      scheduleAlertCollapse("new_message", newAlertTimerRef);
    }
    previousNewCountRef.current = newInboundConversations.length;
  }, [newInboundConversations.length]);

  useEffect(() => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    if (!notice) {
      setExpandedAlerts((current) => ({ ...current, system_notice: false }));
      return;
    }
    setExpandedAlerts((current) => ({ ...current, system_notice: true }));
    scheduleAlertCollapse("system_notice", noticeTimerRef);
  }, [notice]);

  useEffect(
    () => () => {
      [humanAlertTimerRef, newAlertTimerRef, noticeTimerRef].forEach((timerRef) => {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }
      });
    },
    [],
  );

  if (hasToken === null) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  return (
    <>
      <DashboardScaffold
        title="Atendimento"
        description="Mensagens com costume visual de chat, automacao por engrenagem e agenda separada da operacao."
        hideHeader={botStudioOpen || agendaStudioOpen}
        layoutMode="workspace"
        actions={
          <div className={recoveryStyles.heroTabGroup} role="tablist" aria-label="Guias do Atendimento">
            {TAB_ITEMS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === activeTab}
                className={tab.id === activeTab ? recoveryStyles.heroTabActive : recoveryStyles.heroTab}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      >
        {error ? <div className="alert alert-error">{error}</div> : null}

        {activeTab === "messages" ? (
          <WorkspaceShell
            key={`inbox-workspace:${String(currentUserProfile?.company?.id || "tenant-default")}:${String(
              currentUserProfile?.role || "USER",
            ).toUpperCase()}:${String(
              currentUserProfile?.id ||
                currentUserProfile?.username ||
                currentUserProfile?.email ||
                "anonymous",
            )}:${loadingList ? "loading" : "ready"}:${filteredConversations.length}:${selectedId || "none"}:${selectedConversation?.messages.length || 0}`}
            moduleLabel="Atendimento"
            scope={{
              tenantId: String(currentUserProfile?.company?.id || "tenant-default"),
              moduleKey: SHARED_CONVERSATION_WORKSPACE_MODULE_KEY,
              role: String(currentUserProfile?.role || "USER").toUpperCase(),
              userId: String(
                currentUserProfile?.id ||
                  currentUserProfile?.username ||
                  currentUserProfile?.email ||
                  "anonymous",
              ),
              isMaster: Boolean(currentUserProfile?.isSystemMaster),
            }}
            panels={inboxWorkspacePanels}
            components={inboxWorkspaceComponents}
            createDefaultLayout={createSharedConversationWorkspaceLayout}
            chromeMode="minimal"
            className={styles.workspaceDockShell}
            toolbarSlot={
              <>
                <button
                  type="button"
                  className={`btn btn-sm ${inboxQueue === "all" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setInboxQueue("all")}
                >
                  Conversas
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${inboxQueue === "closed" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setInboxQueue("closed")}
                >
                  Conversas encerradas
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${inboxQueue === "blocked" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setInboxQueue("blocked")}
                >
                  Clientes bloqueados
                </button>
              </>
            }
          />
        ) : null}

        {activeTab === "customers" ? (
          <section className={styles.stackSection}>
            <article className={`panel ${recoveryStyles.sectionCard} ${recoveryStyles.registerTableCard}`}>
              <div className={recoveryStyles.sectionHeader}>
                <div>
                  <p className={recoveryStyles.sectionEyebrow}>Clientes cadastrados</p>
                </div>
                <div className={styles.footerActions}>
                  <span className="badge badge-brand">{atendimentoCustomers.length} clientes</span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setCustomerForm({ phone: "", name: "", route: "atendimento", notes: "" });
                      setShowCreateCustomerModal(true);
                    }}
                  >
                    Novo cliente
                  </button>
                </div>
              </div>

              {loadingCustomers ? (
                <div className={styles.emptyState}>Carregando clientes...</div>
              ) : atendimentoCustomers.length === 0 ? (
                <div className={styles.emptyState}>Nenhum cliente cadastrado ainda. Clientes aparecem aqui automaticamente ao interagir pelo WhatsApp.</div>
              ) : (
                <div className={recoveryStyles.tableWrap}>
                  <table className={recoveryStyles.importPreviewTable}>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Origem</th>
                        <th>Recovery</th>
                        <th>Ultima interacao</th>
                        <th>Cadastrado em</th>
                        <th>Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {atendimentoCustomers.map((customer) => (
                        <tr key={customer.id}>
                          <td className={styles.customerCell}>
                            <strong>{customer.name ?? <em className={styles.mutedText}>Sem nome confirmado</em>}</strong>
                            <span>{customer.phone}</span>
                          </td>
                          <td>
                            <span className={
                              customer.registrationOrigin === "manual" ? styles.badgeManual :
                              customer.registrationOrigin === "recovery" ? styles.badgeRecovery :
                              styles.badgeWhatsapp
                            }>
                              {customer.registrationOrigin === "manual" ? "Manual" :
                               customer.registrationOrigin === "recovery" ? "Recovery" : "WhatsApp"}
                            </span>
                          </td>
                          <td>
                            {customer.recoveryCustomerId ? (
                              <div className={styles.customerCell}>
                                <span className={customer.recoveryStatus === "PAID" ? styles.badgeConfirmed : styles.badgeDebt}>
                                  {customer.recoveryStatus === "PAID" ? "Pago" : "Inadimplente"}
                                </span>
                                {customer.openAmount != null ? (
                                  <span className={styles.mutedText}>{formatCurrency(customer.openAmount)}</span>
                                ) : null}
                              </div>
                            ) : (
                              <span className={styles.mutedText}>-</span>
                            )}
                          </td>
                          <td>{formatDateLabel(customer.lastMessageAt, mounted)}</td>
                          <td>{formatDateLabel(customer.createdAt, mounted)}</td>
                          <td>
                            <div className={styles.footerActions}>
                              {customer.conversationId ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => {
                                    setActiveTab("messages");
                                    void loadConversation(String(customer.conversationId));
                                  }}
                                >
                                  Ver conversa
                                </button>
                              ) : null}
                              {!customer.recoveryCustomerId ? (
                                <button
                                  type="button"
                                  className="btn btn-warning btn-sm"
                                  onClick={() => {
                                    setPromoteTarget(customer);
                                    setPromoteForm({
                                      openAmount: "",
                                      saleDate: "",
                                      companyName: customer.name ?? "",
                                    });
                                  }}
                                >
                                  Enviar para Recovery
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            {showCreateCustomerModal ? (
              <div className={styles.modalBackdrop}>
                <div className={styles.modalCard}>
                  <h3 className={styles.modalTitle}>Novo cliente</h3>
                  <form
                    onSubmit={async (event: FormEvent) => {
                      event.preventDefault();
                      if (!customerForm.phone.trim()) return;
                      setSavingCustomer(true);
                      try {
                        await apiFetch("/inbox/customers", {
                          method: "POST",
                          body: JSON.stringify({
                            phone: customerForm.phone.trim(),
                            name: customerForm.name.trim() || undefined,
                            route: customerForm.route || "atendimento",
                            notes: customerForm.notes.trim() || undefined,
                          }),
                        });
                        setShowCreateCustomerModal(false);
                        setNotice({ tone: "success", text: "Cliente cadastrado com sucesso." });
                        void loadAtendimentoCustomers();
                      } catch (saveError) {
                        setNotice({
                          tone: "error",
                          text: saveError instanceof Error ? saveError.message : "Erro ao cadastrar cliente.",
                        });
                      } finally {
                        setSavingCustomer(false);
                      }
                    }}
                  >
                    <div className={styles.formGroup}>
                      <label htmlFor="cust-phone">Telefone (WhatsApp) *</label>
                      <input
                        id="cust-phone"
                        name="customerPhone"
                        type="tel"
                        className={styles.formInput}
                        placeholder="Ex: 5511999998888"
                        value={customerForm.phone}
                        onChange={(event) => setCustomerForm((prev) => ({ ...prev, phone: event.target.value }))}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="cust-name">Nome</label>
                      <input
                        id="cust-name"
                        name="customerName"
                        type="text"
                        className={styles.formInput}
                        placeholder="Nome do cliente"
                        value={customerForm.name}
                        onChange={(event) => setCustomerForm((prev) => ({ ...prev, name: event.target.value }))}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="cust-notes">Observacoes</label>
                      <textarea
                        id="cust-notes"
                        name="customerNotes"
                        className={styles.formInput}
                        placeholder="Informacoes adicionais"
                        value={customerForm.notes}
                        onChange={(event) => setCustomerForm((prev) => ({ ...prev, notes: event.target.value }))}
                        rows={3}
                      />
                    </div>
                    <div className={styles.modalActions}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowCreateCustomerModal(false)}
                        disabled={savingCustomer}
                      >
                        Cancelar
                      </button>
                      <button type="submit" className="btn btn-primary btn-sm" disabled={savingCustomer}>
                        {savingCustomer ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}

            {promoteTarget ? (
              <div className={styles.modalBackdrop}>
                <div className={styles.modalCard}>
                  <h3 className={styles.modalTitle}>Enviar para Recovery</h3>
                  <p className={styles.modalSubtitle}>
                    Cliente: <strong>{promoteTarget.name ?? promoteTarget.phone}</strong>
                  </p>
                  <form
                    onSubmit={async (event: FormEvent) => {
                      event.preventDefault();
                      const amount = parseFloat(promoteForm.openAmount.replace(",", "."));
                      if (!amount || amount <= 0) return;
                      setSavingPromotion(true);
                      try {
                        await apiFetch(`/inbox/customers/${promoteTarget.id}/promote-to-recovery`, {
                          method: "POST",
                          body: JSON.stringify({
                            openAmount: amount,
                            saleDate: promoteForm.saleDate || undefined,
                            companyName: promoteForm.companyName.trim() || undefined,
                          }),
                        });
                        setPromoteTarget(null);
                        setNotice({ tone: "success", text: "Cliente enviado para o HBX Recovery." });
                        void loadAtendimentoCustomers();
                      } catch (saveError) {
                        setNotice({
                          tone: "error",
                          text: saveError instanceof Error ? saveError.message : "Erro ao promover cliente.",
                        });
                      } finally {
                        setSavingPromotion(false);
                      }
                    }}
                  >
                    <div className={styles.formGroup}>
                      <label htmlFor="rec-company">Empresa (opcional)</label>
                      <input
                        id="rec-company"
                        name="recoveryCompanyName"
                        type="text"
                        className={styles.formInput}
                        placeholder="Nome da empresa"
                        value={promoteForm.companyName}
                        onChange={(event) =>
                          setPromoteForm((prev) => ({ ...prev, companyName: event.target.value }))
                        }
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="rec-amount">Valor em aberto (R$) *</label>
                      <input
                        id="rec-amount"
                        name="recoveryOpenAmount"
                        type="text"
                        inputMode="decimal"
                        className={styles.formInput}
                        placeholder="Ex: 1500,00"
                        value={promoteForm.openAmount}
                        onChange={(event) => setPromoteForm((prev) => ({ ...prev, openAmount: event.target.value }))}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="rec-date">Data do servico / venda</label>
                      <input
                        id="rec-date"
                        name="recoverySaleDate"
                        type="date"
                        className={styles.formInput}
                        value={promoteForm.saleDate}
                        onChange={(event) => setPromoteForm((prev) => ({ ...prev, saleDate: event.target.value }))}
                      />
                    </div>
                    <div className={styles.modalActions}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setPromoteTarget(null)}
                        disabled={savingPromotion}
                      >
                        Cancelar
                      </button>
                      <button type="submit" className="btn btn-warning btn-sm" disabled={savingPromotion}>
                        {savingPromotion ? "Enviando..." : "Confirmar"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "agenda" ? (
          <section className={styles.stackSection}>
            <article className={styles.workspaceCard}>
              <div className={styles.sectionHead}>
                <div>
                  <p className={styles.sectionEyebrow}>Agenda do grupo</p>
                </div>
                <div className={styles.headerActions}>
                  <ChatIconButton
                    icon="gear"
                    label="Agenda"
                    onClick={() => setAgendaStudioOpen(true)}
                    title="Configurar agenda"
                    aria-label="Configurar agenda"
                  />
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setAgendaStudioOpen(true)}>
                    Abrir
                  </button>
                </div>
              </div>
            </article>
            <article className={styles.workspaceCard}>
              <div className={styles.sectionHead}>
                <div>
                  <p className={styles.sectionEyebrow}>Editor do bot</p>
                  <small>Abra o builder visual do Atendimento.</small>
                </div>
                <div className={styles.headerActions}>
                  <ChatIconButton
                    icon="gear"
                    label="Editor"
                    onClick={() => setBotStudioOpen(true)}
                    title="Configurar editor do bot"
                    aria-label="Configurar editor do bot"
                  />
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setBotStudioOpen(true)}>
                    Abrir editor
                  </button>
                </div>
              </div>
            </article>
          </section>
        ) : null}

        <div className={styles.notificationDock}>
          {notice ? (
            expandedAlerts.system_notice ? (
              <article className={`${styles.notificationCard} ${styles.notificationCardInfo}`}>
                <div className={styles.notificationHeader}>
                  <div>
                    <p className={styles.attentionEyebrow}>Atualizacao do sistema</p>
                    <strong>{notice.tone === "success" ? "Acao concluida" : "Falha na acao"}</strong>
                  </div>
                  <button type="button" className={styles.closePopupButton} onClick={() => setNotice(null)}>
                    Fechar
                  </button>
                </div>
                <p className={styles.attentionPreview}>{notice.text}</p>
              </article>
            ) : (
              <button
                type="button"
                className={`${styles.notificationMinimized} ${styles.notificationMinimizedInfo}`}
                onClick={() => {
                  setExpandedAlerts((current) => ({ ...current, system_notice: true }));
                  scheduleAlertCollapse("system_notice", noticeTimerRef);
                }}
              >
                Atualizacao do sistema
              </button>
            )
          ) : null}

          {humanAttentionPreview && !dismissedAlerts.human_queue ? (
            expandedAlerts.human_queue ? (
              <article className={styles.notificationCard}>
                <div className={styles.notificationHeader}>
                  <div>
                    <p className={styles.attentionEyebrow}>{humanQueueLabel}</p>
                    <p className={styles.notificationModule}>
                      {humanAttentionPreview.routeTarget === "recovery" ? "Recovery" : "Atendimento"}
                    </p>
                    <strong>{humanAttentionPreview.customer.name || humanAttentionPreview.customer.phone}</strong>
                    <p className={styles.notificationModule}>{humanAttentionPreview.customer.phone}</p>
                  </div>
                  <span className={styles.pulseBadge}>Fila humana</span>
                </div>
                <p className={styles.attentionPreview}>{getMessagePreview(humanAttentionPreview.messages?.[0])}</p>
                <div className={styles.footerActions}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setActiveTab("messages");
                      setDismissedAlerts((current) => ({ ...current, human_queue: true }));
                      void loadConversation(humanAttentionPreview.id);
                    }}
                  >
                    Abrir conversa
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setDismissedAlerts((current) => ({ ...current, human_queue: true }))}
                  >
                    Dispensar
                  </button>
                </div>
              </article>
            ) : (
              <button
                type="button"
                className={`${styles.notificationMinimized} ${styles.notificationUnread}`}
                onClick={() => {
                  setExpandedAlerts((current) => ({ ...current, human_queue: true }));
                  scheduleAlertCollapse("human_queue", humanAlertTimerRef);
                }}
              >
                {humanQueueLabel}
                <span className={styles.notificationCount}>{humanAttentionConversations.length}</span>
              </button>
            )
          ) : null}

          {newInboundPreview && !dismissedAlerts.new_message ? (
            expandedAlerts.new_message ? (
              <article className={styles.notificationCard}>
                <div className={styles.notificationHeader}>
                  <div>
                    <p className={styles.attentionEyebrow}>Nova mensagem no Atendimento</p>
                    <strong>{newInboundPreview.customer.name || newInboundPreview.customer.phone}</strong>
                  </div>
                  <button
                    type="button"
                    className={styles.closePopupButton}
                    onClick={() => setDismissedAlerts((current) => ({ ...current, new_message: true }))}
                  >
                    Fechar
                  </button>
                </div>
                <p className={styles.attentionPreview}>{getMessagePreview(newInboundPreview.messages?.[0])}</p>
                <div className={styles.footerActions}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setActiveTab("messages");
                      setDismissedAlerts((current) => ({ ...current, new_message: true }));
                      void loadConversation(newInboundPreview.id);
                    }}
                  >
                    Abrir fila agora
                  </button>
                </div>
              </article>
            ) : (
              <button
                type="button"
                className={`${styles.notificationMinimized} ${styles.notificationUnread}`}
                onClick={() => {
                  setExpandedAlerts((current) => ({ ...current, new_message: true }));
                  scheduleAlertCollapse("new_message", newAlertTimerRef);
                }}
              >
                Nova mensagem no Atendimento
                <span className={styles.notificationCount}>{newInboundConversations.length}</span>
              </button>
            )
          ) : null}
        </div>
      </DashboardScaffold>

      {botStudioOpen ? (
        <div className={styles.botStudioOverlay}>
          <div className={styles.botStudioFrame}>
            <div className={styles.botStudioChrome}>
              <div>
                <p className={styles.sectionEyebrow}>Automacao do Atendimento</p>
                <h3>Builder conversacional do Atendimento</h3>
                <small>Mesmo padrão visual do Recovery, com organograma vertical e preview navegável.</small>
              </div>
              <div className={styles.headerActions}>
                <span className={styles.metaBadge}>{selectedConversationStatusMeta?.label || "Fluxo geral"}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBotStudioOpen(false)}>
                  Fechar
                </button>
              </div>
            </div>
            <div className={styles.botStudioBody}>
              <BotPanel
                botConfig={botConfig}
                loadingBot={loadingBot}
                savingBot={savingBot}
                actionOptions={actionOptions}
                agendaOptions={agendaOptions}
                onSave={() => {
                  setNotice(null);
                  void saveBot();
                }}
                onUpdateRoutingRule={updateRoutingRule}
                onAppendVariable={appendVariable}
                onUpdateBotText={updateBotText}
                onUpdateButtonSection={updateButtonSection}
                onAddButtonSection={addButtonSection}
                onRemoveButtonSection={removeButtonSection}
                onUpdateActionGuide={updateActionGuide}
                onAddCustomAction={addCustomAction}
                onRemoveCustomAction={removeCustomAction}
              />
            </div>
          </div>
        </div>
      ) : null}

      {agendaStudioOpen ? (
        <div className={styles.botStudioOverlay}>
          <div className={styles.botStudioFrame}>
            <div className={styles.botStudioChrome}>
              <div>
                <p className={styles.sectionEyebrow}>Agenda do Atendimento</p>
              </div>
              <div className={styles.headerActions}>
                <span className={styles.metaBadge}>{agendaConfig.groups.length} guias ativas</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAgendaStudioOpen(false)}>
                  Fechar
                </button>
              </div>
            </div>
            <div className={styles.botStudioBody}>{renderAgendaPanel()}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
