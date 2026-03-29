"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChatActionGrid,
  ChatAvatar,
  ChatComposer,
  ChatEmptyState,
  ChatFieldNote,
  ChatIconButton,
  ChatMessageBubble,
  ChatQueue,
  ChatQueueItem,
  ChatInfoCard,
  ChatThread,
} from "@/components/chat/PremiumChat";
import DashboardScaffold from "@/components/DashboardScaffold";
import ConversationActionList from "@/components/workspace/ConversationActionList";
import ConversationBadgeList from "@/components/workspace/ConversationBadgeList";
import ConversationContextPanel from "@/components/workspace/ConversationContextPanel";
import ConversationListPane from "@/components/workspace/ConversationListPane";
import ConversationQueueFilterBar from "@/components/workspace/ConversationQueueFilterBar";
import WorkspaceSegmentedControl from "@/components/workspace/WorkspaceSegmentedControl";
import ConversationWorkspaceStatus from "@/components/workspace/ConversationWorkspaceStatus";
import {
  buildAtendimentoContextActions,
  buildAtendimentoContextSummary,
  buildAtendimentoRecoveryPaymentHistory,
  buildAtendimentoRecoverySummary,
  buildAtendimentoQueueBadges,
  formatAtendimentoRecoveryPaymentStatusLabel,
  getAtendimentoComposerHint,
  getAtendimentoRecoveryPaymentDate,
  getAtendimentoConversationStatusMeta,
  hasAtendimentoOpenDebt,
  hasAtendimentoRecoveryContext,
  isAtendimentoAgendaConversation,
  isAtendimentoRecoveryPrimary,
  mapAtendimentoConversationToneToQueueTone,
} from "@/components/workspace/adapters/atendimento";
import { acquirePopupTopbarLock } from "@/lib/popup-visibility";
import { apiFetch } from "../_lib/api";
import { startSmartPolling } from "../_lib/polling";
import { useRequireAuth } from "../_lib/useRequireAuth";
import AgendaPanel from "./_components/AgendaPanel";
import BotPanel from "./_components/BotPanel";
import TemplatesPanel, { type TemplateComposer } from "./_components/TemplatesPanel";
import type {
  RecoveryMetaTemplateItem,
  RecoveryMetaTemplatesPayload,
} from "../../hbx-recovery/recovery-model";
import {
  ATENDIMENTO_QUEUE_EVENT,
  DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  DEFAULT_ATENDIMENTO_BOT_CONFIG,
  buildAgendaActionId,
  fetchBrazilianHolidays,
  formatCurrency,
  getMessagePreview,
  normalizeAgendaConfig,
  normalizeBotConfig,
  type AtendimentoAgendaConfig,
  type AtendimentoAgendaSimulationPayload,
  type AtendimentoAgendaSimulationResult,
  type AtendimentoBotActionGuide,
  type AtendimentoBotConfig,
  type InboxConversation,
  type InboxMessage,
} from "./inbox-model";
import styles from "./page.module.css";

type InboxTab = "messages" | "automation";
type InboxQueue = "all" | "recovery" | "scheduled" | "bot" | "closed";
type ContextTab = "conversa" | "financeiro" | "agenda";
type AtendimentoSection = "conversa" | "financeiro" | "agenda" | "automacao";
type StatusFilter = "all" | "new" | "open" | "closed" | "blocked";

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

type UserModule = {
  key: string;
  accessible: boolean;
};

const ATENDIMENTO_PENDING_STORAGE_KEY = "atendimentoPendingHumanCount";
const DEFAULT_META_TEMPLATES_PAYLOAD: RecoveryMetaTemplatesPayload = {
  phoneNumberId: null,
  wabaId: null,
  lastSyncAt: null,
  syncError: null,
  counters: {
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    hbxActive: 0,
    eligible: 0,
  },
  templates: [],
  history: [],
};

const DEFAULT_TEMPLATE_COMPOSER: TemplateComposer = {
  name: "",
  category: "UTILITY",
  language: "pt_BR",
  bodyText:
    "Olá, tudo bem? Aqui é da {{empresa}}.\nFalo com {{cliente}}?\nTemos um assunto financeiro pendente referente ao serviço realizado em {{data_servico}}.\nEu poderia te mostrar opções de pagamentos?",
  footerText: "Recovery",
  buttonsText: "Sim\nNão, obrigado",
  activateInHbx: true,
  headerFormat: "NONE",
  headerText: "",
  headerHandle: "",
  headerMediaUrl: "",
};

const CONTEXT_TAB_ITEMS: Array<{ id: ContextTab; label: string }> = [
  { id: "conversa", label: "Conversa" },
  { id: "financeiro", label: "Financeiro" },
  { id: "agenda", label: "Agenda" },
];

const ATENDIMENTO_SECTION_ITEMS: Array<{ id: AtendimentoSection; label: string }> = [
  { id: "conversa", label: "Conversa" },
  { id: "financeiro", label: "Financeiro" },
  { id: "agenda", label: "Agenda" },
  { id: "automacao", label: "Automacao" },
];

function normalizeInboxTab(value: string | null | undefined): InboxTab | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "messages") {
    return "messages";
  }
  if (normalized === "automation" || normalized === "agenda" || normalized === "recovery") {
    return "automation";
  }
  return null;
}

function getInboxQueueLabel(queue: InboxQueue) {
  switch (queue) {
    case "recovery":
      return "Chat • Recovery";
    case "scheduled":
      return "Chat • Agendamento";
    case "bot":
      return "Chat • BOT";
    case "closed":
      return "Encerrados";
    default:
      return "Chat";
  }
}

function getConversationPrimaryActionLabel(conversation: InboxConversation | null) {
  if (!conversation) return "Selecione uma conversa para operar.";
  if (conversation.isBlocked) return "Desbloqueie o contato para responder.";
  if (hasAtendimentoOpenDebt(conversation)) {
    return "Responder e revisar o financeiro quando preciso.";
  }
  if (hasAtendimentoRecoveryContext(conversation)) {
    return "Responder sem perder o contexto financeiro desta conversa.";
  }
  if (isAtendimentoAgendaConversation(conversation)) {
    return "Responder e acompanhar a agenda.";
  }
  if (conversation.status === "open") {
    return "Conduza o atendimento e encerre quando resolver.";
  }
  if (conversation.status === "closed") {
    return "Reabra apenas se houver novo contexto.";
  }
  return "Responda ou assuma no humano sem sair da inbox.";
}

function getConversationNoteStorageKey(companyId: number | null | undefined, conversationId: string | null) {
  if (!companyId || !conversationId) return null;
  return `hbx:inbox:note:${companyId}:${conversationId}`;
}

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

function parseTemplateButtonLines(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeMetaTemplatesPayload(
  payload: RecoveryMetaTemplatesPayload | null | undefined,
): RecoveryMetaTemplatesPayload {
  const counters = payload?.counters;
  return {
    ...DEFAULT_META_TEMPLATES_PAYLOAD,
    ...(payload || {}),
    syncError:
      payload?.syncError !== undefined && payload?.syncError !== null
        ? String(payload.syncError)
        : null,
    counters: {
      total: Number(counters?.total || 0),
      approved: Number(counters?.approved || 0),
      pending: Number(counters?.pending || 0),
      rejected: Number(counters?.rejected || 0),
      hbxActive: Number(counters?.hbxActive || 0),
      eligible: Number(counters?.eligible || 0),
    },
    templates: Array.isArray(payload?.templates) ? payload.templates : [],
    history: Array.isArray(payload?.history) ? payload.history : [],
  };
}

function fillTemplateComposerFromTemplate(template: RecoveryMetaTemplateItem): TemplateComposer {
  const normalized = template.normalized;
  const buttons =
    Array.isArray(normalized?.buttons) && normalized.buttons.length > 0
      ? normalized.buttons.map((button) => String(button.text || "").trim()).filter(Boolean)
      : Array.isArray(template.buttonLabels)
        ? template.buttonLabels
        : [];

  return {
    name: String(template.name || ""),
    category:
      String(template.category || "").toUpperCase() === "MARKETING"
        ? "MARKETING"
        : String(template.category || "").toUpperCase() === "AUTHENTICATION"
          ? "AUTHENTICATION"
          : "UTILITY",
    language: String(template.language || "pt_BR"),
    bodyText: String(normalized?.body?.text ?? template.bodyText ?? ""),
    footerText: String(normalized?.footer?.text ?? template.footerText ?? ""),
    buttonsText: buttons.join("\n"),
    activateInHbx: Boolean(template.hbxActive),
    headerFormat:
      normalized?.header?.format === "TEXT" ||
      normalized?.header?.format === "IMAGE" ||
      normalized?.header?.format === "DOCUMENT" ||
      normalized?.header?.format === "VIDEO"
        ? normalized.header.format
        : "NONE",
    headerText: String(normalized?.header?.text ?? template.headerText ?? ""),
    headerHandle: String(normalized?.header?.exampleHandle ?? template.headerHandle ?? ""),
    headerMediaUrl: String(normalized?.header?.mediaUrl ?? template.headerMediaUrl ?? ""),
  };
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

function areInboxMessageListsEquivalent(
  leftMessages?: InboxMessage[] | null,
  rightMessages?: InboxMessage[] | null,
) {
  const left = Array.isArray(leftMessages) ? leftMessages : [];
  const right = Array.isArray(rightMessages) ? rightMessages : [];
  if (left.length !== right.length) return false;

  return left.every((message, index) => {
    const candidate = right[index];
    if (!candidate) return false;
    return (
      String(message.id) === String(candidate.id) &&
      String(message.createdAt || "") === String(candidate.createdAt || "") &&
      String(message.direction || "") === String(candidate.direction || "") &&
      String(message.senderType || "") === String(candidate.senderType || "") &&
      String(message.status || "") === String(candidate.status || "") &&
      String(message.content || "") === String(candidate.content || "")
    );
  });
}

function didInboxConversationViewChange(
  current?: InboxConversation | null,
  next?: InboxConversation | null,
) {
  if (!current && !next) return false;
  if (!current || !next) return true;
  if (current.id !== next.id) return true;

  const comparableFields = [
    "updatedAt",
    "status",
    "routeTarget",
    "routeReason",
    "currentFlow",
    "flowResult",
    "latestSourceModule",
    "isBlocked",
    "blockedAt",
    "blockedReason",
    "humanAssigned",
    "botActive",
    "recoveryCustomerId",
    "recoveryCurrentStep",
    "recoveryStatus",
    "recoveryOpenAmount",
    "recoveryTotalPaid",
  ] as const;

  if (
    comparableFields.some(
      (field) => String(current[field] ?? "") !== String(next[field] ?? ""),
    )
  ) {
    return true;
  }

  if (String(current.customer?.name || "") !== String(next.customer?.name || "")) return true;
  if (String(current.customer?.phone || "") !== String(next.customer?.phone || "")) return true;
  if (String(current.customer?.customerProfileId || "") !== String(next.customer?.customerProfileId || "")) return true;
  if (String(current.customer?.email || "") !== String(next.customer?.email || "")) return true;
  if (String(current.customer?.document || "") !== String(next.customer?.document || "")) return true;
  if (String(current.customer?.customerProfileStatus || "") !== String(next.customer?.customerProfileStatus || "")) return true;
  if (String(current.customer?.registrationStatus || "") !== String(next.customer?.registrationStatus || "")) return true;

  return !areInboxMessageListsEquivalent(current.messages, next.messages);
}

function areInboxConversationListsEquivalent(
  currentList?: InboxConversation[] | null,
  nextList?: InboxConversation[] | null,
) {
  const current = Array.isArray(currentList) ? currentList : [];
  const next = Array.isArray(nextList) ? nextList : [];
  if (current.length !== next.length) return false;

  return current.every((conversation, index) =>
    !didInboxConversationViewChange(conversation, next[index]),
  );
}

function mapInboxBubbleTone(message: InboxMessage) {
  const direction = String(message.direction || "").trim().toLowerCase();
  const senderType = String(message.senderType || "").trim().toLowerCase();
  if (senderType === "system") return "system" as const;
  if (senderType === "human") return "human" as const;
  if (direction === "outbound") return "outbound" as const;
  return "inbound" as const;
}

function formatInboxSourceModuleLabel(sourceRaw: string | null | undefined) {
  const source = String(sourceRaw || "").trim().toLowerCase();
  if (!source) return null;

  const labels: Record<string, string> = {
    hbx_recovery: "Recovery",
    hbx_recovery_bot: "BOT Recovery",
    atendimento_human: "Humano Atendimento",
    atendimento_internal: "Sistema Atendimento",
    whatsapp: "WhatsApp",
  };

  return labels[source] || source.replace(/[_-]+/g, " ");
}

function getInboxMessageSenderLabel(message: InboxMessage) {
  const sourceLabel = formatInboxSourceModuleLabel(message.sourceModule);
  if (sourceLabel === "Recovery" || sourceLabel === "BOT Recovery") {
    return sourceLabel;
  }

  const senderType = String(message.senderType || "").trim().toLowerCase();
  if (senderType === "human") return "Humano";
  if (senderType === "system") return "Sistema";
  return String(message.direction || "").trim().toLowerCase() === "outbound" ? "HBX" : "Cliente";
}

function getInboxMessageTypeLabel(message: InboxMessage) {
  const sourceLabel = formatInboxSourceModuleLabel(message.sourceModule);
  const messageType = String(message.messageType || "texto").replace(/_/g, " ");
  if (messageType === "system event" && sourceLabel) {
    return `${messageType} • ${sourceLabel}`;
  }
  return messageType;
}

function getInboxMessageMeta(message: InboxMessage, mounted: boolean) {
  const sourceLabel = formatInboxSourceModuleLabel(message.sourceModule);
  const base = formatDateLabel(message.createdAt, mounted);
  if (!sourceLabel || sourceLabel === "Recovery" || sourceLabel === "BOT Recovery") {
    return base;
  }
  return `${base} • ${sourceLabel}`;
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

export default function InboxClientPage() {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = useMemo(
    () => normalizeInboxTab(searchParams?.get("atendimentoTab")) || "messages",
    [searchParams],
  );
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<InboxTab>(requestedTab);
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
  const [conversationListError, setConversationListError] = useState<string | null>(null);
  const [conversationDetailError, setConversationDetailError] = useState<string | null>(null);
  const [lastConversationSyncAt, setLastConversationSyncAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [agendaStudioOpen, setAgendaStudioOpen] = useState(false);
  const [automationStudioOpen, setAutomationStudioOpen] = useState(false);
  const [templatesStudioOpen, setTemplatesStudioOpen] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [contextTab, setContextTab] = useState<ContextTab>("conversa");
  const [internalNote, setInternalNote] = useState("");
  const [botConfig, setBotConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [agendaConfig, setAgendaConfig] = useState<AtendimentoAgendaConfig>(
    DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  );
  const [metaTemplates, setMetaTemplates] = useState<RecoveryMetaTemplatesPayload>(
    DEFAULT_META_TEMPLATES_PAYLOAD,
  );
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [editingTemplateLabel, setEditingTemplateLabel] = useState<string | null>(null);
  const [templateComposer, setTemplateComposer] = useState<TemplateComposer>(
    DEFAULT_TEMPLATE_COMPOSER,
  );
  const [currentUserProfile, setCurrentUserProfile] = useState<CurrentUserProfile | null>(null);
  const [userModules, setUserModules] = useState<UserModule[]>([]);
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
  const skipNotePersistRef = useRef(false);
  const chatTimelineRef = useRef<HTMLDivElement | null>(null);
  const conversationsRef = useRef<InboxConversation[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const selectedConversationRef = useRef<InboxConversation | null>(null);


  useEffect(() => {
    if (requestedTab !== "automation" || automationStudioOpen) return;
    setAutomationStudioOpen(true);
    setAgendaStudioOpen(false);
    setTemplatesStudioOpen(false);
    setActiveTab("messages");
  }, [automationStudioOpen, requestedTab]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!agendaStudioOpen && !automationStudioOpen && !templatesStudioOpen) return;
    const releaseTopbarLock = acquirePopupTopbarLock();
    return releaseTopbarLock;
  }, [agendaStudioOpen, automationStudioOpen, templatesStudioOpen]);

  useEffect(() => {
    if (!agendaStudioOpen && !automationStudioOpen && !templatesStudioOpen) {
      setOverlayVisible(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setOverlayVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [agendaStudioOpen, automationStudioOpen, templatesStudioOpen]);


  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation, selectedId]);

  const loadConversation = useCallback(async (id: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    const summary =
      conversationsRef.current.find((conversation) => conversation.id === id) || null;
    const mergedSummary = mergeInboxConversationSummary(
      summary,
      selectedConversationRef.current?.id === id ? selectedConversationRef.current : null,
    );
    setSelectedId(id);
    if (mergedSummary && (!silent || !selectedConversationRef.current)) {
      setSelectedConversation(mergedSummary);
    }
    setConversationDetailError(null);
    if (!silent) setLoadingConversation(true);
    try {
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${id}`);
      setSelectedConversation((current) =>
        silent && !didInboxConversationViewChange(current, data) ? current : data,
      );
      setSelectedId(data.id);
      setConversationDetailError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar conversa.";
      setConversationDetailError(message);
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
      setConversationListError(null);
      try {
        const data = await apiFetch<InboxConversation[]>("/inbox/conversations");
        const currentList = conversationsRef.current;
        const listChanged = !areInboxConversationListsEquivalent(currentList, data);

        if (listChanged) {
          setConversations(data);
        }
        setConversationListError(null);
        if (listChanged || !lastConversationSyncAt) {
          setLastConversationSyncAt(new Date().toISOString());
        }

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
          setSelectedConversation((current) =>
            !listChanged && silent && !didInboxConversationViewChange(current, mergedConversation)
              ? current
              : mergedConversation,
          );
        } else if (!nextId) {
          setSelectedConversation(null);
        }

        if (
          listChanged &&
          nextId &&
          shouldReloadInboxConversation(nextSummary, selectedConversationRef.current)
        ) {
          void loadConversation(nextId, { silent: true });
        } else if (nextSummary && selectedConversationRef.current?.id === nextId) {
          setSelectedConversation((current) =>
            current && current.id === nextId
              ? didInboxConversationViewChange(current, {
                  ...current,
                  ...nextSummary,
                  messages: current.messages,
                })
                ? {
                    ...current,
                    ...nextSummary,
                    messages: current.messages,
                  }
                : current
              : current,
          );
        } else {
          setSelectedConversation(null);
        }
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Falha ao carregar conversas.";
        setConversationListError(message);
        if (!silent || conversationsRef.current.length === 0) {
          setError(message);
        }
      } finally {
        if (!silent) setLoadingList(false);
      }
    },
    [lastConversationSyncAt, loadConversation],
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

  const loadUserModules = useCallback(async () => {
    try {
      const data = await apiFetch<UserModule[]>("/modules/me");
      setUserModules(Array.isArray(data) ? data : []);
    } catch {
      setUserModules([]);
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
    void Promise.all([loadBotConfig(), loadAgendaConfig(), loadCurrentUser(), loadUserModules()]);
  }, [hasToken, loadAgendaConfig, loadBotConfig, loadCurrentUser, loadUserModules]);

  const filteredConversations = useMemo(() => {
    if (inboxQueue === "closed") {
      return conversations.filter(
        (conversation) =>
          conversation.status === "closed" ||
          conversation.status === "blocked" ||
          conversation.isBlocked,
      );
    }
    if (inboxQueue === "recovery") {
      return conversations.filter(
        (conversation) =>
          conversation.status !== "closed" &&
          !conversation.isBlocked &&
          hasAtendimentoRecoveryContext(conversation),
      );
    }
    if (inboxQueue === "scheduled") {
      return conversations.filter(
        (conversation) =>
          conversation.status !== "closed" &&
          !conversation.isBlocked &&
          isAtendimentoAgendaConversation(conversation),
      );
    }
    if (inboxQueue === "bot") {
      return conversations.filter(
        (conversation) =>
          conversation.status !== "closed" &&
          !conversation.isBlocked &&
          conversation.status !== "open" &&
          conversation.botActive !== false,
      );
    }
    return conversations.filter(
      (conversation) => conversation.status !== "closed" && !conversation.isBlocked,
    );
  }, [conversations, inboxQueue]);

  const inboxQueueDiagnostics = useMemo(
    () => [
      {
        label: "Sessao",
        value: hasToken === true ? "ativa" : hasToken === false ? "sem token" : "validando",
      },
      {
        label: "Fila",
        value: getInboxQueueLabel(inboxQueue),
      },
      {
        label: "Recebidas",
        value: String(conversations.length),
      },
      {
        label: "Visiveis",
        value: String(filteredConversations.length),
      },
      {
        label: "Selecionada",
        value: selectedId || "--",
      },
      {
        label: "Ultima leitura",
        value: lastConversationSyncAt ? formatDateLabel(lastConversationSyncAt, mounted) : "nenhuma",
      },
    ],
    [conversations.length, filteredConversations.length, hasToken, inboxQueue, lastConversationSyncAt, mounted, selectedId],
  );

  const inboxDetailDiagnostics = useMemo(
    () => [
      {
        label: "Conversa",
        value: selectedId || "--",
      },
      {
        label: "Fila",
        value: getInboxQueueLabel(inboxQueue),
      },
      {
        label: "Mensagens em cache",
        value: String(selectedConversation?.messages.length || 0),
      },
      {
        label: "Ultima leitura",
        value: lastConversationSyncAt ? formatDateLabel(lastConversationSyncAt, mounted) : "nenhuma",
      },
    ],
    [inboxQueue, lastConversationSyncAt, mounted, selectedConversation?.messages.length, selectedId],
  );

  const retryConversationList = useCallback(() => {
    void loadConversations({ preferredId: selectedIdRef.current });
  }, [loadConversations]);

  const retryConversationDetail = useCallback(() => {
    if (!selectedIdRef.current) return;
    void loadConversation(selectedIdRef.current);
  }, [loadConversation]);

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

  const hasRecoveryCapability = useMemo(
    () =>
      userModules.some(
        (module) => module.accessible && (module.key === "atendimento" || module.key === "hbx_recovery"),
      ),
    [userModules],
  );

  const selectedStatus = selectedConversation?.status ?? "new";
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
    ? getAtendimentoConversationStatusMeta(selectedConversation, hasRecoveryCapability)
    : null;
  const selectedConversationIsAgenda = selectedConversation
    ? isAtendimentoAgendaConversation(selectedConversation)
    : false;
  const selectedConversationHasRecoveryContext =
    hasRecoveryCapability && selectedConversation
      ? hasAtendimentoRecoveryContext(selectedConversation)
      : false;
  const selectedConversationHasOpenDebt =
    hasRecoveryCapability && selectedConversation
      ? hasAtendimentoOpenDebt(selectedConversation)
      : false;
  const selectedConversationRecoveryPrimary =
    hasRecoveryCapability && selectedConversation
      ? isAtendimentoRecoveryPrimary(selectedConversation)
      : false;
  const selectedHeaderBadges = useMemo(() => {
    if (!selectedConversation || !selectedConversationStatusMeta) return [];

    const primaryTone =
      selectedConversationStatusMeta.tone === "human"
        ? "success"
        : selectedConversationStatusMeta.tone === "recovery"
          ? "warning"
          : selectedConversationStatusMeta.tone === "blocked"
            ? "danger"
            : selectedConversationStatusMeta.tone === "closed"
              ? "neutral"
              : "brand";

    const badges: Array<{
      label: string;
      tone: "neutral" | "brand" | "teal" | "success" | "warning" | "danger";
    }> = [
      {
        label: selectedConversationStatusMeta.label,
        tone: primaryTone,
      },
    ];

    if (selectedConversationHasOpenDebt) {
      badges.push({
        label: formatCurrency(Number(selectedConversation.recoveryOpenAmount || 0)),
        tone: "warning",
      });
    } else if (selectedConversationHasRecoveryContext && !selectedConversationRecoveryPrimary) {
      badges.push({ label: "Financeiro", tone: "warning" });
    } else if (selectedConversationIsAgenda) {
      badges.push({ label: "Agenda", tone: "teal" });
    }

    return badges;
  }, [
    selectedConversation,
    selectedConversationHasOpenDebt,
    selectedConversationHasRecoveryContext,
    selectedConversationRecoveryPrimary,
    selectedConversationIsAgenda,
    selectedConversationStatusMeta,
  ]);
  const selectedPrimaryActionLabel = getConversationPrimaryActionLabel(selectedConversation);
  const noteStorageKey = useMemo(
    () =>
      getConversationNoteStorageKey(
        currentUserProfile?.company?.id ?? null,
        selectedConversation?.id ?? null,
      ),
    [currentUserProfile?.company?.id, selectedConversation?.id],
  );
  const humanAttentionPreview = humanAttentionConversations[0] || null;
  const newInboundPreview = newInboundConversations[0] || null;
  const humanQueueLabel = `${humanAttentionConversations.length} mensagem${
    humanAttentionConversations.length === 1 ? "" : "s"
  }`;
  const queueListTitle = inboxQueue === "closed" ? "Encerradas" : "Chat";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!noteStorageKey) {
      setInternalNote("");
      return;
    }
    skipNotePersistRef.current = true;
    try {
      setInternalNote(window.localStorage.getItem(noteStorageKey) || "");
    } catch {
      setInternalNote("");
    }
  }, [noteStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !noteStorageKey) return;
    if (skipNotePersistRef.current) {
      skipNotePersistRef.current = false;
      return;
    }
    try {
      if (internalNote.trim()) {
        window.localStorage.setItem(noteStorageKey, internalNote);
      } else {
        window.localStorage.removeItem(noteStorageKey);
      }
    } catch {
      // ignore storage errors
    }
  }, [internalNote, noteStorageKey]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const summaryParts = [
      `Atendimento na aba ${activeTab}`,
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
            agendaStudioOpen ? "agenda_aberta" : "agenda_fechada",
            selectedBlocked ? "bloqueado" : "ativo",
          ],
          details: {
            activeTab,
            selectedConversationId: selectedId || null,
            selectedConversationName: selectedConversation?.customer?.name || null,
            selectedConversationPhone: selectedConversation?.customer?.phone || null,
            selectedCustomerProfileId: selectedConversation?.customer?.customerProfileId || null,
            selectedStatus,
            selectedRoute: selectedConversation?.routeTarget || null,
            selectedBlocked,
            loadingConversation,
            loadingBot,
            savingBot,
            loadingAgenda,
            savingAgenda,
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

  const handleSectionChange = useCallback((nextSection: AtendimentoSection) => {
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (nextSection === "automacao") {
      setActiveTab("messages");
      setAutomationStudioOpen(true);
      setTemplatesStudioOpen(false);
      setAgendaStudioOpen(false);
      params.set("atendimentoTab", "automation");
    } else if (nextSection === "agenda") {
      setActiveTab("messages");
      setAgendaStudioOpen(true);
      setAutomationStudioOpen(false);
      setTemplatesStudioOpen(false);
      setContextTab("agenda");
      params.delete("atendimentoTab");
    } else {
      setAutomationStudioOpen(false);
      setTemplatesStudioOpen(false);
      setAgendaStudioOpen(false);
      setContextTab(nextSection);
      params.delete("atendimentoTab");
    }
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  const resetTemplateComposer = useCallback(() => {
    setTemplateComposer(DEFAULT_TEMPLATE_COMPOSER);
    setEditingTemplateLabel(null);
  }, []);

  const loadMetaTemplates = useCallback(async (refresh = false) => {
    setLoadingTemplates(true);
    try {
      const query = refresh ? "?refresh=true" : "";
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>(`/hbx-recovery/meta-templates${query}`);
      const safePayload = normalizeMetaTemplatesPayload(payload);
      setMetaTemplates(safePayload);
      if (safePayload.syncError) {
        setNotice({ tone: "error", text: `Falha ao carregar templates Meta: ${safePayload.syncError}` });
      }
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar templates Meta.";
      setNotice({ tone: "error", text: message });
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const syncMetaTemplatesNow = useCallback(async () => {
    setSyncingTemplates(true);
    try {
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>("/hbx-recovery/meta-templates/sync", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const safePayload = normalizeMetaTemplatesPayload(payload);
      setMetaTemplates(safePayload);
      setNotice({
        tone: safePayload.syncError ? "error" : "success",
        text: safePayload.syncError || "Templates Meta sincronizados com sucesso.",
      });
    } catch (syncError) {
      const message =
        syncError instanceof Error ? syncError.message : "Falha ao sincronizar templates Meta.";
      setNotice({ tone: "error", text: message });
    } finally {
      setSyncingTemplates(false);
    }
  }, []);

  const openTemplatesSettings = useCallback(() => {
    setAutomationStudioOpen(false);
    setAgendaStudioOpen(false);
    setTemplatesStudioOpen(true);
    void loadMetaTemplates();
  }, [loadMetaTemplates]);

  const closeAutomationExperience = useCallback(() => {
    setAutomationStudioOpen(false);
    setTemplatesStudioOpen(false);
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("atendimentoTab");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  const editMetaTemplate = useCallback((template: RecoveryMetaTemplateItem) => {
    setTemplateComposer(fillTemplateComposerFromTemplate(template));
    setEditingTemplateLabel(`${template.name} • ${template.language}`);
  }, []);

  const toggleTemplateActivation = useCallback(
    async (template: RecoveryMetaTemplateItem, active: boolean) => {
      try {
        const payload = await apiFetch<RecoveryMetaTemplatesPayload>(
          "/hbx-recovery/meta-templates/activation",
          {
            method: "PATCH",
            body: JSON.stringify({
              name: template.name,
              language: template.language,
              active,
            }),
          },
        );
        setMetaTemplates(normalizeMetaTemplatesPayload(payload));
        setNotice({
          tone: "success",
          text: active
            ? `Template ${template.name} ativado no HBX.`
            : `Template ${template.name} ocultado no HBX.`,
        });
      } catch (updateError) {
        const message =
          updateError instanceof Error ? updateError.message : "Falha ao atualizar template.";
        setNotice({ tone: "error", text: message });
      }
    },
    [],
  );

  const deleteMetaTemplate = useCallback(async (template: RecoveryMetaTemplateItem) => {
    const deletingKey = `${template.name}:${template.language}`;
    setDeletingTemplateId(deletingKey);
    try {
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>("/hbx-recovery/meta-templates", {
        method: "DELETE",
        body: JSON.stringify({
          id: template.id,
          name: template.name,
          language: template.language,
        }),
      });
      setMetaTemplates(normalizeMetaTemplatesPayload(payload));
      setNotice({ tone: "success", text: `Template ${template.name} excluido com sucesso.` });
      if (editingTemplateLabel?.startsWith(template.name)) {
        resetTemplateComposer();
      }
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "Falha ao excluir template.";
      setNotice({ tone: "error", text: message });
    } finally {
      setDeletingTemplateId(null);
    }
  }, [editingTemplateLabel, resetTemplateComposer]);

  const createMetaTemplate = useCallback(async () => {
    const normalizedName = String(templateComposer.name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const bodyText = String(templateComposer.bodyText || "").trim();
    if (!normalizedName) {
      setNotice({ tone: "error", text: "Informe um nome interno valido para o template." });
      return;
    }
    if (bodyText.length < 10) {
      setNotice({ tone: "error", text: "O corpo do template ainda esta muito curto." });
      return;
    }
    setCreatingTemplate(true);
    try {
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>("/hbx-recovery/meta-templates/create", {
        method: "POST",
        body: JSON.stringify({
          name: normalizedName,
          category: templateComposer.category,
          language: templateComposer.language || "pt_BR",
          headerFormat:
            templateComposer.headerFormat === "NONE" ? undefined : templateComposer.headerFormat,
          headerText: templateComposer.headerText || "",
          headerHandle: templateComposer.headerHandle || "",
          headerMediaUrl: templateComposer.headerMediaUrl || "",
          bodyText,
          footerText: templateComposer.footerText || "",
          buttons: parseTemplateButtonLines(templateComposer.buttonsText),
          variableExamples: {},
          activateInHbx: templateComposer.activateInHbx,
        }),
      });
      setMetaTemplates(normalizeMetaTemplatesPayload(payload));
      setNotice({ tone: "success", text: `Template ${normalizedName} enviado para aprovacao.` });
      resetTemplateComposer();
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Falha ao criar template.";
      setNotice({ tone: "error", text: message });
    } finally {
      setCreatingTemplate(false);
    }
  }, [resetTemplateComposer, templateComposer]);

  useEffect(() => {
    if (!templatesStudioOpen) return;
    if (metaTemplates.templates.length > 0) return;
    void loadMetaTemplates();
  }, [loadMetaTemplates, metaTemplates.templates.length, templatesStudioOpen]);

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
      if (!selectedId || !sendText.trim() || selectedBlocked) return;
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
    [loadConversations, selectedBlocked, selectedId, sendText],
  );

  const inboxWorkspaceComponents = useMemo(
    () => ({
      list: () => (
          <ConversationListPane
          eyebrow={undefined}
          title={queueListTitle}
          description={undefined}
          count={filteredConversations.length}
          actions={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleSectionChange("automacao")}
            >
              Fluxo
            </button>
          }
          className={`${styles.workspaceDockPanel} ${styles.inboxListPanel}`}
          bodyClassName={`${styles.workspaceDockBody} ${styles.inboxListBody}`}
        >
          <ConversationQueueFilterBar
            value={inboxQueue}
            onChange={(value) => {
              if (value !== "blocked") {
                setInboxQueue(value);
              }
            }}
          />
          {loadingList ? (
            <ChatEmptyState title="Carregando conversas">A fila sera montada assim que a leitura inicial terminar.</ChatEmptyState>
          ) : conversationListError && filteredConversations.length === 0 ? (
            <ConversationWorkspaceStatus
              title="Falha ao carregar conversas"
              description={conversationListError}
              tone="error"
              diagnostics={inboxQueueDiagnostics}
              onRetry={retryConversationList}
              retryLabel="Recarregar fila"
            />
          ) : filteredConversations.length === 0 ? (
            <ChatEmptyState title="Nenhuma conversa encontrada">Ajuste o filtro ou aguarde novas mensagens entrarem na fila.</ChatEmptyState>
          ) : (
            <ChatQueue className={styles.conversationList}>
              {filteredConversations.map((conversation) => {
                const active = conversation.id === selectedId;
                const latestMessage = conversation.messages?.[0];
                const statusMeta = getAtendimentoConversationStatusMeta(
                  conversation,
                  hasRecoveryCapability,
                );
                return (
                  <ChatQueueItem
                    key={conversation.id}
                    active={active}
                    onClick={() => loadConversation(conversation.id)}
                    initials={String(conversation.customer.name || conversation.customer.phone).slice(0, 2).toUpperCase()}
                    label={statusMeta.shortLabel}
                    tone={mapAtendimentoConversationToneToQueueTone(statusMeta.tone)}
                    title={conversation.customer.name || conversation.customer.phone}
                    subtitle={
                      isAtendimentoAgendaConversation(conversation)
                        ? `${conversation.customer.phone} • Agenda em curso`
                        : conversation.customer.phone
                    }
                    preview={getMessagePreview(latestMessage)}
                    meta={formatTimeLabel(conversation.updatedAt, mounted)}
                    badges={
                      <ConversationBadgeList
                        badges={buildAtendimentoQueueBadges(conversation, hasRecoveryCapability)}
                      />
                    }
                  />
                );
              })}
            </ChatQueue>
          )}
        </ConversationListPane>
      ),
      main: () => (
        <section className={`${styles.workspaceDockPanel} ${styles.inboxMainPanel} ${styles.chatStagePanel}`}>
          {loadingConversation ? (
            <ChatEmptyState title="Carregando conversa">Preparando historico e contexto do cliente.</ChatEmptyState>
          ) : conversationDetailError && selectedId ? (
            <ConversationWorkspaceStatus
              title="Falha ao abrir conversa"
              description={conversationDetailError}
              tone="error"
              diagnostics={inboxDetailDiagnostics}
              onRetry={retryConversationDetail}
              retryLabel="Reabrir conversa"
            />
          ) : !selectedConversation ? (
            <ChatEmptyState title="Nenhuma conversa selecionada">Escolha uma conversa na fila para abrir o chat.</ChatEmptyState>
          ) : (
            <ChatThread
              avatar={
                <ChatAvatar
                  initials={String(selectedConversationDisplayName).slice(0, 2).toUpperCase()}
                  label={selectedConversationStatusMeta?.shortLabel || "BOT"}
                  tone={mapAtendimentoConversationToneToQueueTone(selectedConversationStatusMeta?.tone || "bot")}
                />
              }
              title={selectedConversationDisplayName}
              subtitle={selectedConversation.customer.phone}
              badges={<ConversationBadgeList badges={selectedHeaderBadges} />}
              actions={
                <div className={styles.threadActionRail}>
                  {selectedConversationHasRecoveryContext ? (
                    <ChatIconButton
                      icon="wallet"
                      onClick={() => setContextTab("financeiro")}
                      title="Abrir contexto financeiro"
                      aria-label="Abrir contexto financeiro"
                    />
                  ) : null}
                  {selectedConversationIsAgenda ? (
                    <ChatIconButton
                      icon="clock"
                      onClick={() => setContextTab("agenda")}
                      title="Abrir contexto de agenda"
                      aria-label="Abrir contexto de agenda"
                    />
                  ) : null}
                  <ChatIconButton
                    icon="gear"
                    onClick={() => handleSectionChange("automacao")}
                    title="Abrir editor de automacao"
                    aria-label="Abrir editor de automacao"
                  />
                </div>
              }
              footer={
                <form className={styles.threadComposerForm} onSubmit={sendMessage}>
                  <ChatComposer
                    title="Responder"
                    description={selectedPrimaryActionLabel}
                    toolbar={
                      <span className={styles.inlineContextBadge}>
                        {selectedConversationStatusMeta?.label || "Ativo"}
                      </span>
                    }
                    footer={
                      <>
                        <ChatFieldNote>
                          {getAtendimentoComposerHint(selectedConversation, hasRecoveryCapability)}
                        </ChatFieldNote>
                        <div className={styles.threadComposerActions}>
                          <span className={styles.threadComposerCount}>{sendText.trim().length} caracteres</span>
                          <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={sending || !sendText.trim() || selectedBlocked}
                          >
                            {sending ? "Enviando..." : "Enviar resposta"}
                          </button>
                        </div>
                      </>
                    }
                  >
                    <textarea
                      id="atendimento-chat-reply"
                      name="atendimentoChatReply"
                      className={`field ${styles.threadComposerInput}`}
                      rows={5}
                      value={sendText}
                      onChange={(event) => setSendText(event.target.value)}
                      placeholder={
                        selectedBlocked
                          ? "Contato bloqueado. Desbloqueie para responder."
                          : "Escreva a resposta aqui e envie sem sair da conversa..."
                      }
                      disabled={selectedBlocked || sending}
                    />
                  </ChatComposer>
                </form>
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
                      sender={getInboxMessageSenderLabel(message)}
                      messageType={getInboxMessageTypeLabel(message)}
                      meta={getInboxMessageMeta(message, mounted)}
                    >
                      <p>{getMessagePreview(message)}</p>
                    </ChatMessageBubble>
                  ))
                )}
              </div>
            </ChatThread>
          )}
        </section>
      ),
      context: () => (
        <ConversationContextPanel
          eyebrow={undefined}
          title="Cliente"
          description={undefined}
          count={selectedConversation ? CONTEXT_TAB_ITEMS.find((item) => item.id === contextTab)?.label : "--"}
          actions={
            selectedConversation ? (
              <WorkspaceSegmentedControl
                items={CONTEXT_TAB_ITEMS}
                value={contextTab}
                onChange={(nextValue) => setContextTab(nextValue as ContextTab)}
                className={styles.contextTabs}
                highlightClassName={styles.contextTabHighlight}
                buttonClassName={styles.contextTab}
                activeButtonClassName={styles.contextTabActive}
                role="tablist"
                buttonRole="tab"
                ariaLabel="Abas de contexto do cliente"
              />
            ) : undefined
          }
          className={`${styles.workspaceDockPanel} ${styles.inboxContextPanel}`}
          bodyClassName={`${styles.workspaceDockBody} ${styles.inboxContextBody}`}
        >
          {!selectedConversation ? (
            <ChatEmptyState title="Sem contexto ativo">Abra uma conversa para liberar os atalhos operacionais.</ChatEmptyState>
          ) : (
            <div className={styles.contextStack}>
              {contextTab === "conversa" ? (
                <div className={styles.contextGrid}>
                  <ChatInfoCard
                    title="Resumo do cliente"
                    meta={
                      selectedConversationRecoveryPrimary
                        ? "financeiro"
                        : selectedConversationHasRecoveryContext
                          ? "atendimento + financeiro"
                          : "atendimento"
                    }
                  >
                    {buildAtendimentoContextSummary({
                      conversation: selectedConversation,
                      displayName: selectedConversationDisplayName,
                      statusLabel: selectedConversationStatusMeta?.label ?? "-",
                      updatedAtLabel: formatDateLabel(selectedConversation.updatedAt, mounted),
                      blockedAtLabel: selectedBlocked
                        ? formatDateLabel(selectedConversation.blockedAt, mounted)
                        : null,
                      formatCurrency,
                      allowRecoveryCapability: hasRecoveryCapability,
                    }).map((item) => (
                      <p key={item.label}>
                        <strong>{item.label}:</strong> {item.value}
                      </p>
                    ))}
                  </ChatInfoCard>

                  <ChatInfoCard title="Acoes rapidas" meta="Operacao">
                    <ChatActionGrid className={styles.quickActionsGrid}>
                      <ConversationActionList
                        actions={buildAtendimentoContextActions({
                          conversation: selectedConversation,
                          selectedStatus,
                          selectedBlocked,
                          allowRecoveryCapability: hasRecoveryCapability,
                          openFinance: () => handleSectionChange("financeiro"),
                          openAutomation: () => handleSectionChange("automacao"),
                          openAgenda: () => {
                            setContextTab("agenda");
                            setAgendaStudioOpen(true);
                          },
                          updateStatus,
                          blockConversation,
                          unblockConversation,
                        })}
                      />
                    </ChatActionGrid>
                  </ChatInfoCard>

                  <ChatInfoCard title="Nota interna" meta="Local nesta estacao" muted>
                    <div className={styles.internalNoteCard}>
                      <textarea
                        className={`field ${styles.internalNoteInput}`}
                        rows={6}
                        value={internalNote}
                        onChange={(event) => setInternalNote(event.target.value)}
                        placeholder="Anote contexto operacional rapido, proxima ligacao ou combinados internos..."
                      />
                      <ChatFieldNote>
                        Salva localmente no navegador desta estacao, sem alterar backend ou API.
                      </ChatFieldNote>
                    </div>
                  </ChatInfoCard>
                </div>
              ) : null}

              {contextTab === "financeiro" ? (
                selectedConversationHasRecoveryContext ? (
                  <div className={styles.contextGrid}>
                    <ChatInfoCard title="Resumo financeiro" meta={selectedConversation.recoveryStatus || "cobranca"}>
                      {buildAtendimentoRecoverySummary({
                        conversation: selectedConversation,
                        formatCurrency,
                      }).map((item) => (
                        <p key={item.label}>
                          <strong>{item.label}:</strong> {item.value}
                        </p>
                      ))}
                    </ChatInfoCard>

                    <ChatInfoCard title="Inadimplencia" meta={selectedConversation.recoveryCurrentStep || "ativa"}>
                      <p>
                        <strong>Valor pendente:</strong> {formatCurrency(Number(selectedConversation.recoveryOpenAmount || 0))}
                      </p>
                      <p>
                        <strong>Status:</strong> {selectedConversation.recoveryStatus || "-"}
                      </p>
                      <p>
                        <strong>Fluxo atual:</strong> {selectedConversation.currentFlow || "-"}
                      </p>
                      <p>
                        <strong>Origem:</strong> {selectedConversation.latestSourceModule || "-"}
                      </p>
                      <div className={styles.contextButtonRow}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void updateStatus("open")}
                          disabled={selectedBlocked}
                        >
                          Atendimento humano
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setContextTab("agenda");
                            setAgendaStudioOpen(true);
                          }}
                        >
                          Abrir agenda
                        </button>
                      </div>
                    </ChatInfoCard>

                    <ChatInfoCard title="Historico de pagamentos" meta={selectedConversation.recoveryTotalPaid > 0 ? formatCurrency(selectedConversation.recoveryTotalPaid) : "sem baixa"}>
                      <p>
                        <strong>Total recuperado:</strong> {formatCurrency(Number(selectedConversation.recoveryTotalPaid || 0))}
                      </p>
                      <p>
                        <strong>Eventos recentes:</strong> {buildAtendimentoRecoveryPaymentHistory(selectedConversation).length}
                      </p>
                      <p>
                        <strong>Ultima atualizacao:</strong> {formatDateLabel(selectedConversation.updatedAt, mounted)}
                      </p>
                    </ChatInfoCard>

                    <ChatInfoCard title="Pagamentos recentes" meta={buildAtendimentoRecoveryPaymentHistory(selectedConversation).length}>
                      {buildAtendimentoRecoveryPaymentHistory(selectedConversation).length > 0 ? (
                        <div className={styles.recoveryPaymentHistory}>
                          {buildAtendimentoRecoveryPaymentHistory(selectedConversation).map((payment) => (
                            <article key={payment.id} className={styles.recoveryPaymentRow}>
                              <div>
                                <strong>{formatCurrency(payment.amount)}</strong>
                                <p>
                                  {formatAtendimentoRecoveryPaymentStatusLabel(payment.status)}
                                  {payment.chargeType
                                    ? ` • ${payment.chargeType === "parcelado" ? "Parcelado" : "A vista"}`
                                    : ""}
                                </p>
                                <p>{formatDateLabel(getAtendimentoRecoveryPaymentDate(payment), mounted)}</p>
                              </div>
                              {payment.paymentUrl ? (
                                <a
                                  href={payment.paymentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-secondary btn-sm"
                                >
                                  Abrir link
                                </a>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <ChatFieldNote>Nenhum pagamento recente vinculado a esta cobranca.</ChatFieldNote>
                      )}
                    </ChatInfoCard>
                  </div>
                ) : (
                  <ChatEmptyState title="Sem contexto financeiro">Esta conversa ainda nao tem sinais financeiros relevantes. O foco continua na conversa central.</ChatEmptyState>
                )
              ) : null}

              {contextTab === "agenda" ? (
                <div className={styles.contextGrid}>
                  <ChatInfoCard title="Agenda" meta={`${agendaConfig.groups.length} guias`}>
                    <p>
                      <strong>Contexto:</strong>{" "}
                      {selectedConversationIsAgenda
                        ? "Cliente em jornada de agendamento ou follow-up agendado."
                        : "Nenhum sinal forte de agenda nesta conversa agora."}
                    </p>
                    <p>
                      <strong>Guias ativas:</strong> {agendaConfig.groups.filter((group) => group.isActive).length}
                    </p>
                    <p>
                      <strong>Conexoes prontas:</strong>{" "}
                      {
                        agendaConfig.groups.filter((group) => group.connectionStatus === "connected")
                          .length
                      }
                    </p>
                  </ChatInfoCard>

                  <ChatInfoCard title="Operacao de agenda" meta="Acesso rapido" muted>
                    <div className={styles.contextButtonRow}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setAgendaStudioOpen(true);
                        }}
                      >
                        Abrir agenda
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSectionChange("automacao")}
                      >
                        Ver automacao
                      </button>
                    </div>
                    <ChatFieldNote>
                      A agenda continua separada como configuracao, mas aparece aqui como contexto da mesma inbox.
                    </ChatFieldNote>
                  </ChatInfoCard>
                </div>
              ) : null}

            </div>
          )}
        </ConversationContextPanel>
      ),
    }),
    [
      agendaConfig.groups,
      blockConversation,
      conversationDetailError,
      conversationListError,
      contextTab,
      internalNote,
      hasRecoveryCapability,
      filteredConversations,
      handleSectionChange,
      inboxDetailDiagnostics,
      inboxQueue,
      inboxQueueDiagnostics,
      loadConversation,
      loadingConversation,
      loadingList,
      mounted,
      retryConversationDetail,
      retryConversationList,
      selectedBlocked,
      selectedConversation,
      selectedConversationDisplayName,
      selectedHeaderBadges,
      selectedConversationHasRecoveryContext,
      selectedConversationIsAgenda,
      selectedConversationRecoveryPrimary,
      selectedConversationStatusMeta,
      selectedId,
      selectedPrimaryActionLabel,
      selectedStatus,
      queueListTitle,
      sendMessage,
      sendText,
      sending,
      unblockConversation,
      updateStatus,
    ],
  );

  const InboxListPanel = inboxWorkspaceComponents.list;
  const InboxMainPanel = inboxWorkspaceComponents.main;
  const InboxContextPanel = inboxWorkspaceComponents.context;

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

  const syncBotConfig = useCallback((nextConfig: AtendimentoBotConfig) => {
    setBotConfig(nextConfig);
  }, []);

  const saveBot = useCallback(async (nextConfig: AtendimentoBotConfig = botConfig) => {
    setSavingBot(true);
    setError(null);
    try {
      const payload = await apiFetch<AtendimentoBotConfig>("/inbox/bot-config", {
        method: "PATCH",
        body: JSON.stringify(nextConfig),
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
        description="Inbox unificada com conversa dominante, Recovery como contexto e atalhos operacionais enxutos."
        hideHeader={true}
        hideNavigationRail={true}
        layoutMode="workspace"
        actions={
          <WorkspaceSegmentedControl
            items={ATENDIMENTO_SECTION_ITEMS}
            value={
              templatesStudioOpen || automationStudioOpen
                ? "automacao"
                : agendaStudioOpen
                  ? "agenda"
                  : contextTab
            }
            onChange={(nextSection) => handleSectionChange(nextSection as AtendimentoSection)}
            className={styles.moduleTabs}
            highlightClassName={styles.moduleTabHighlight}
            buttonClassName={styles.moduleTab}
            activeButtonClassName={styles.moduleTabActive}
            role="tablist"
            buttonRole="tab"
            ariaLabel="Navegacao principal do Atendimento"
          />
        }
      >
        {error ? <div className="alert alert-error">{error}</div> : null}

        {activeTab === "messages" ? (
          <section className={styles.inboxCanvas} data-ui-no-reveal="true">
            <section className={styles.inboxStage}>
              <div className={styles.inboxStageList}>
                <InboxListPanel />
              </div>
              <div className={styles.inboxStageMain}>
                <InboxMainPanel />
              </div>
              <div className={styles.inboxStageContext}>
                <InboxContextPanel />
              </div>
            </section>
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

      {agendaStudioOpen ? (
        <div className={`${styles.botStudioOverlay} ${overlayVisible ? styles.botStudioOverlayActive : ""}`}>
          <div className={`${styles.botStudioFrame} ${overlayVisible ? styles.botStudioFrameActive : ""}`}>
            <div className={styles.botStudioChrome}>
              <div>
                <p className={styles.botStudioChromeEyebrow}>Atendimento</p>
                <strong>Agenda operacional</strong>
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

      {automationStudioOpen ? (
        <div className={`${styles.botStudioOverlay} ${overlayVisible ? styles.botStudioOverlayActive : ""}`}>
          <div className={`${styles.botStudioFrame} ${overlayVisible ? styles.botStudioFrameActive : ""}`}>
            <div className={styles.botStudioChrome}>
              <div>
                <p className={styles.botStudioChromeEyebrow}>Atendimento</p>
                <strong>Automacao</strong>
              </div>
              <div className={styles.headerActions}>
                <span className={styles.metaBadge}>Fluxo principal</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={openTemplatesSettings}>
                  Configuracoes
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={closeAutomationExperience}>
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
                onSave={(nextConfig) => {
                  setNotice(null);
                  void saveBot(nextConfig);
                }}
                onConfigChange={syncBotConfig}
                onOpenSettings={openTemplatesSettings}
              />
            </div>
          </div>
        </div>
      ) : null}

      {templatesStudioOpen ? (
        <div className={`${styles.botStudioOverlay} ${overlayVisible ? styles.botStudioOverlayActive : ""}`}>
          <div className={`${styles.botStudioFrame} ${overlayVisible ? styles.botStudioFrameActive : ""}`}>
            <div className={styles.botStudioChrome}>
              <div>
                <p className={styles.botStudioChromeEyebrow}>Automacao</p>
                <strong>Templates Meta</strong>
              </div>
              <div className={styles.headerActions}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadMetaTemplates(true)}>
                  Recarregar
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={syncMetaTemplatesNow} disabled={syncingTemplates}>
                  {syncingTemplates ? "Sincronizando..." : "Sincronizar"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setTemplatesStudioOpen(false);
                    setAutomationStudioOpen(true);
                  }}
                >
                  Fechar configuracoes
                </button>
              </div>
            </div>
            <div className={styles.botStudioBody}>
              <TemplatesPanel
                loadingTemplates={loadingTemplates}
                syncingTemplates={syncingTemplates}
                metaTemplates={metaTemplates}
                templateComposer={templateComposer}
                creatingTemplate={creatingTemplate}
                deletingTemplateId={deletingTemplateId}
                editingTemplateLabel={editingTemplateLabel}
                onReload={() => void loadMetaTemplates(true)}
                onSync={() => void syncMetaTemplatesNow()}
                onToggleActivation={(template, active) => void toggleTemplateActivation(template, active)}
                onComposerChange={(updater) => setTemplateComposer((current) => updater(current))}
                onCreateTemplate={() => void createMetaTemplate()}
                onDeleteTemplate={(template) => void deleteMetaTemplate(template)}
                onEditTemplate={editMetaTemplate}
                onResetComposer={resetTemplateComposer}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
