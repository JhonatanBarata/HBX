"use client";

import Link from "next/link";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  RecoveryMetaTemplateItem,
  RecoveryMetaTemplatesPayload,
} from "@/app/hbx-recovery/recovery-model";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { startSmartPolling } from "../_lib/polling";
import { useRequireAuth } from "../_lib/useRequireAuth";
import AgendaPanel from "./_components/AgendaPanel";
import BotPanel from "./_components/BotPanel";
import TemplatesPanel, { type TemplateComposer } from "./_components/TemplatesPanel";
import {
  ATENDIMENTO_QUEUE_EVENT,
  DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  DEFAULT_ATENDIMENTO_BOT_CONFIG,
  buildAgendaActionId,
  createCustomAction,
  formatCurrency,
  getMessagePreview,
  normalizeAgendaConfig,
  normalizeBotConfig,
  type AtendimentoAgendaConfig,
  type AtendimentoBotActionGuide,
  type AtendimentoBotButton,
  type AtendimentoBotConfig,
  type AtendimentoBotVariableScope,
  type InboxConversation,
  type InboxMessage,
  type InboxRouteTarget,
} from "./inbox-model";
import styles from "./page.module.css";
import recoveryStyles from "@/app/hbx-recovery/page.module.css";

type InboxTab = "customers" | "messages" | "templates" | "agenda" | "bot";
type StatusFilter = "all" | "new" | "open" | "closed" | "blocked";
type RouteFilter = "all" | InboxRouteTarget;
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

type ActionOption = {
  value: string;
  label: string;
};

const ATENDIMENTO_PENDING_STORAGE_KEY = "atendimentoPendingHumanCount";

const EMPTY_META_TEMPLATES_PAYLOAD: RecoveryMetaTemplatesPayload = {
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
  bodyText: "",
  footerText: "",
  buttonsText: "",
  activateInHbx: true,
  headerFormat: "NONE",
  headerText: "",
  headerHandle: "",
  headerMediaUrl: "",
};

const TAB_ITEMS: Array<{ id: InboxTab; label: string; description: string }> = [
  {
    id: "messages",
    label: "Mensagens",
    description: "Fila viva do Atendimento com parede real entre Atendimento e Recovery.",
  },
  {
    id: "customers",
    label: "Tabela de clientes",
    description: "Leitura consolidada por telefone, com rota e prioridade operacional.",
  },
  {
    id: "templates",
    label: "Templates Meta",
    description: "Mesmo catalogo oficial do Recovery, agora dentro do Atendimento.",
  },
  {
    id: "agenda",
    label: "Agenda",
    description: "Guias, horarios e botoes que o bot pode oferecer no atendimento.",
  },
  {
    id: "bot",
    label: "Editor do bot",
    description: "Controle total sobre cliente novo, cadastrado, inadimplente e agendamento.",
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

function formatDateLabel(dateStr: string | null | undefined, mounted: boolean) {
  if (!dateStr) return "-";
  const parsed = new Date(dateStr);
  if (!mounted) return parsed.toISOString();
  return parsed.toLocaleString("pt-BR");
}

function getMessageMeta(message: InboxMessage) {
  const parts = [
    String(message.senderType || "").trim().toLowerCase() || "system",
    String(message.messageType || "").trim().toLowerCase() || "text",
    String(message.status || "").trim().toUpperCase() || "RECEIVED",
  ];
  if (message.sourceModule) parts.push(String(message.sourceModule).replaceAll("_", " "));
  if (message.error) parts.push(`erro: ${message.error}`);
  return parts.join(" • ");
}

function getBubbleClass(message: InboxMessage) {
  const direction = String(message.direction || "").trim().toLowerCase();
  const senderType = String(message.senderType || "").trim().toLowerCase();
  if (senderType === "system") return styles.systemBubble;
  if (direction === "outbound") return styles.outboundBubble;
  return styles.inboundBubble;
}

function normalizeTemplateName(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 512);
}

function removeButtonFromSections(config: AtendimentoBotConfig, actionId: string): AtendimentoBotConfig {
  return {
    ...config,
    mainMenuButtons: config.mainMenuButtons.filter((button) => button.actionId !== actionId),
    recoveryDetectedButtons: config.recoveryDetectedButtons.filter(
      (button) => button.actionId !== actionId,
    ),
    postActionButtons: config.postActionButtons.filter((button) => button.actionId !== actionId),
  };
}

export default function InboxClientPage() {
  const hasToken = useRequireAuth();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<InboxTab>("messages");
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<InboxConversation | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [refreshingList, setRefreshingList] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [loadingBot, setLoadingBot] = useState(true);
  const [savingBot, setSavingBot] = useState(false);
  const [loadingAgenda, setLoadingAgenda] = useState(true);
  const [savingAgenda, setSavingAgenda] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [routeFilter, setRouteFilter] = useState<RouteFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [metaTemplates, setMetaTemplates] = useState<RecoveryMetaTemplatesPayload>(
    EMPTY_META_TEMPLATES_PAYLOAD,
  );
  const [templateComposer, setTemplateComposer] = useState<TemplateComposer>(
    DEFAULT_TEMPLATE_COMPOSER,
  );
  const [botConfig, setBotConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [agendaConfig, setAgendaConfig] = useState<AtendimentoAgendaConfig>(
    DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  );
  const [showAttentionCard, setShowAttentionCard] = useState(false);
  const deferredSearch = useDeferredValue(searchTerm);
  const previousPendingRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadConversation = useCallback(async (id: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoadingConversation(true);
    try {
      const data = await apiFetch<InboxConversation>(`/inbox/conversations/${id}`);
      setSelectedConversation(data);
      setSelectedId(data.id);
    } catch (loadError) {
      setSelectedConversation(null);
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
      if (silent) setRefreshingList(true);
      setError(null);
      try {
        const data = await apiFetch<InboxConversation[]>("/inbox/conversations");
        setConversations(data);
        setLastRefreshedAt(new Date().toISOString());

        const preferredId = options?.preferredId ?? selectedId;
        const availableId =
          preferredId && data.some((conversation) => conversation.id === preferredId)
            ? preferredId
            : data[0]?.id ?? null;

        setSelectedId(availableId);
        if (availableId) {
          await loadConversation(availableId, { silent: true });
        } else {
          setSelectedConversation(null);
        }
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Falha ao carregar conversas.";
        setError(message);
      } finally {
        if (!silent) setLoadingList(false);
        if (silent) setRefreshingList(false);
      }
    },
    [loadConversation, selectedId],
  );

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const data = await apiFetch<RecoveryMetaTemplatesPayload>("/inbox/meta-templates");
      setMetaTemplates(data || EMPTY_META_TEMPLATES_PAYLOAD);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar templates Meta.";
      setError(message);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

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

  useEffect(() => {
    if (hasToken !== true) return;
    return startSmartPolling(() => loadConversations({ silent: true }), {
      intervalMs: 10000,
      immediate: true,
    });
  }, [hasToken, loadConversations]);

  useEffect(() => {
    if (hasToken !== true) return;
    void Promise.all([loadBotConfig(), loadAgendaConfig(), loadTemplates()]);
  }, [hasToken, loadAgendaConfig, loadBotConfig, loadTemplates]);

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
      window.localStorage.setItem(
        ATENDIMENTO_PENDING_STORAGE_KEY,
        String(pendingAtendimentoCount),
      );
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

    if (pendingAtendimentoCount === 0) {
      setShowAttentionCard(false);
    } else if (pendingAtendimentoCount > previousPendingRef.current) {
      setShowAttentionCard(true);
    }
    previousPendingRef.current = pendingAtendimentoCount;
  }, [pendingAtendimentoCount]);

  const filteredConversations = useMemo(() => {
    const normalizedSearch = String(deferredSearch || "").trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (statusFilter !== "all" && conversation.status !== statusFilter) return false;
      if (routeFilter !== "all" && conversation.routeTarget !== routeFilter) return false;
      if (!normalizedSearch) return true;
      const haystack = [
        conversation.customer.name || "",
        conversation.customer.phone,
        conversation.routeReason,
        conversation.recoveryCustomerName || "",
        conversation.blockedReason || "",
        getMessagePreview(conversation.messages?.[0]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [conversations, deferredSearch, routeFilter, statusFilter]);

  const customerRows = useMemo(() => {
    const map = new Map<
      string,
      {
        customerName: string;
        phone: string;
        routeTarget: InboxRouteTarget;
        routeReason: string;
        openAmount: number;
        conversationCount: number;
        activeConversationCount: number;
        blockedCount: number;
        updatedAt: string;
        latestPreview: string;
        recoveryCurrentStep: string | null;
        recoverySuggestedPath: string;
        conversationId: string;
      }
    >();

    for (const conversation of filteredConversations) {
      const key = String(conversation.customer.phone || conversation.id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          customerName: conversation.customer.name || conversation.customer.phone,
          phone: conversation.customer.phone,
          routeTarget: conversation.routeTarget,
          routeReason: conversation.routeReason,
          openAmount: conversation.recoveryOpenAmount,
          conversationCount: 1,
          activeConversationCount:
            conversation.status === "new" || conversation.status === "open" ? 1 : 0,
          blockedCount: conversation.status === "blocked" ? 1 : 0,
          updatedAt: conversation.updatedAt,
          latestPreview: getMessagePreview(conversation.messages?.[0]),
          recoveryCurrentStep: conversation.recoveryCurrentStep,
          recoverySuggestedPath: conversation.recoverySuggestedPath,
          conversationId: conversation.id,
        });
        continue;
      }

      existing.conversationCount += 1;
      if (conversation.status === "new" || conversation.status === "open") {
        existing.activeConversationCount += 1;
      }
      if (conversation.status === "blocked") existing.blockedCount += 1;
      if (new Date(conversation.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        existing.updatedAt = conversation.updatedAt;
        existing.routeTarget = conversation.routeTarget;
        existing.routeReason = conversation.routeReason;
        existing.openAmount = conversation.recoveryOpenAmount;
        existing.latestPreview = getMessagePreview(conversation.messages?.[0]);
        existing.recoveryCurrentStep = conversation.recoveryCurrentStep;
        existing.recoverySuggestedPath = conversation.recoverySuggestedPath;
        existing.conversationId = conversation.id;
      }
    }

    return Array.from(map.values()).sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  }, [filteredConversations]);

  const priorityConversations = useMemo(() => {
    const seen = new Set<string>();
    const ordered: InboxConversation[] = [];
    const intake = [
      ...pendingAtendimentoConversations,
      ...conversations.filter(
        (conversation) =>
          conversation.routeTarget === "recovery" && conversation.status !== "blocked",
      ),
    ];

    for (const conversation of intake) {
      if (seen.has(conversation.id)) continue;
      seen.add(conversation.id);
      ordered.push(conversation);
      if (ordered.length >= 5) break;
    }

    return ordered;
  }, [conversations, pendingAtendimentoConversations]);

  const stats = useMemo(
    () => ({
      customers: new Set(
        conversations.map((conversation) => conversation.customer.phone || conversation.id),
      ).size,
      pendingAtendimento: pendingAtendimentoCount,
      recoveryRouted: conversations.filter((conversation) => conversation.routeTarget === "recovery")
        .length,
      blocked: conversations.filter((conversation) => conversation.status === "blocked").length,
      agendas: agendaConfig.groups.length,
      templates: metaTemplates.counters.approved,
    }),
    [
      agendaConfig.groups.length,
      conversations,
      metaTemplates.counters.approved,
      pendingAtendimentoCount,
    ],
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
  ]);

  const agendaOptions = useMemo(
    () => agendaConfig.groups.map((group) => ({ id: group.id, title: group.title })),
    [agendaConfig.groups],
  );

  const selectedTab = TAB_ITEMS.find((tab) => tab.id === activeTab) || TAB_ITEMS[0];
  const selectedStatus = selectedConversation?.status ?? "new";
  const selectedRouteIsRecovery = selectedConversation?.routeTarget === "recovery";
  const selectedBlocked = Boolean(selectedConversation?.isBlocked);
  const selectedPendingPreview = pendingAtendimentoConversations[0] || null;

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

  const simulateMessage = useCallback(async () => {
    setSimulating(true);
    setError(null);
    try {
      const fallback = `+5511${Math.floor(100000000 + Math.random() * 899999999)}`;
      const phone = selectedConversation?.customer.phone || fallback;
      const message = `Mensagem simulada em ${new Date().toLocaleTimeString("pt-BR")}`;
      const data = await apiFetch<InboxConversation>("/inbox/mock-message", {
        method: "POST",
        body: JSON.stringify({ phone, message }),
      });
      setActiveTab("messages");
      setNotice({ tone: "success", text: "Mensagem simulada e enviada para a fila." });
      await loadConversations({ preferredId: data.id, silent: true });
    } catch (simulateError) {
      const message =
        simulateError instanceof Error ? simulateError.message : "Falha ao simular mensagem.";
      setError(message);
    } finally {
      setSimulating(false);
    }
  }, [loadConversations, selectedConversation?.customer.phone]);

  const refreshWorkspace = useCallback(async () => {
    setNotice(null);
    await Promise.all([loadConversations(), loadTemplates(), loadBotConfig(), loadAgendaConfig()]);
  }, [loadAgendaConfig, loadBotConfig, loadConversations, loadTemplates]);

  const syncTemplates = useCallback(async () => {
    setSyncingTemplates(true);
    setError(null);
    try {
      await apiFetch("/inbox/meta-templates/sync", { method: "POST" });
      await loadTemplates();
      setNotice({ tone: "success", text: "Templates Meta sincronizados com sucesso." });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Falha ao sincronizar templates.";
      setError(message);
    } finally {
      setSyncingTemplates(false);
    }
  }, [loadTemplates]);

  const toggleTemplateActivation = useCallback(
    async (template: RecoveryMetaTemplateItem, active: boolean) => {
      setError(null);
      try {
        const payload = await apiFetch<RecoveryMetaTemplatesPayload>(
          "/inbox/meta-templates/activation",
          {
            method: "PATCH",
            body: JSON.stringify({
              name: template.name,
              language: template.language,
              active,
              headerMediaUrl:
                template.normalized?.header?.mediaUrl || template.headerMediaUrl || undefined,
            }),
          },
        );
        setMetaTemplates(payload || EMPTY_META_TEMPLATES_PAYLOAD);
        setNotice({
          tone: "success",
          text: active
            ? `Template ${template.name} ativado para uso no HBX.`
            : `Template ${template.name} desativado no HBX.`,
        });
      } catch (toggleError) {
        const message =
          toggleError instanceof Error ? toggleError.message : "Falha ao alterar template.";
        setError(message);
      }
    },
    [],
  );

  const createTemplate = useCallback(async () => {
    const normalizedName = normalizeTemplateName(templateComposer.name);
    const bodyText = String(templateComposer.bodyText || "").trim();
    if (!normalizedName) {
      setError("Informe um nome interno valido para o template.");
      return;
    }
    if (!bodyText) {
      setError("Informe o corpo do template Meta.");
      return;
    }
    if (templateComposer.headerFormat === "TEXT") {
      const headerText = String(templateComposer.headerText || "").trim();
      if (!headerText) {
        setError("Informe o texto do cabecalho.");
        return;
      }
    }
    if (
      ["IMAGE", "DOCUMENT", "VIDEO"].includes(templateComposer.headerFormat) &&
      !String(templateComposer.headerHandle || "").trim()
    ) {
      setError("Informe o header_handle da Meta para cabecalho com midia.");
      return;
    }
    if (
      templateComposer.activateInHbx &&
      ["IMAGE", "DOCUMENT", "VIDEO"].includes(templateComposer.headerFormat) &&
      !String(templateComposer.headerMediaUrl || "").trim()
    ) {
      setError("Informe a URL publica da midia para ativar o template no HBX.");
      return;
    }

    setCreatingTemplate(true);
    setError(null);
    try {
      await apiFetch("/inbox/meta-templates/create", {
        method: "POST",
        body: JSON.stringify({
          name: normalizedName,
          category: templateComposer.category,
          language: templateComposer.language || "pt_BR",
          headerFormat:
            templateComposer.headerFormat === "NONE" ? undefined : templateComposer.headerFormat,
          headerText: templateComposer.headerText || undefined,
          headerHandle: templateComposer.headerHandle || undefined,
          headerMediaUrl: templateComposer.headerMediaUrl || undefined,
          bodyText,
          footerText: templateComposer.footerText || undefined,
          buttons: String(templateComposer.buttonsText || "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean),
          activateInHbx: templateComposer.activateInHbx,
        }),
      });
      setTemplateComposer(DEFAULT_TEMPLATE_COMPOSER);
      await loadTemplates();
      setNotice({
        tone: "success",
        text: `Template ${normalizedName} enviado para aprovacao na Meta.`,
      });
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Falha ao criar template Meta.";
      setError(message);
    } finally {
      setCreatingTemplate(false);
    }
  }, [loadTemplates, templateComposer]);

  const deleteTemplate = useCallback(
    async (template: RecoveryMetaTemplateItem) => {
      const deletingKey = `${template.name}:${template.language}`;
      const confirmed = window.confirm(
        `Excluir o template ${template.name} (${template.language}) da Meta e do HBX?`,
      );
      if (!confirmed) return;
      setDeletingTemplateId(deletingKey);
      setError(null);
      try {
        await apiFetch("/inbox/meta-templates", {
          method: "DELETE",
          body: JSON.stringify({
            name: template.name,
            language: template.language,
            id: template.id || undefined,
          }),
        });
        await loadTemplates();
        setNotice({ tone: "success", text: `Template ${template.name} excluido.` });
      } catch (deleteError) {
        const message =
          deleteError instanceof Error ? deleteError.message : "Falha ao excluir template.";
        setError(message);
      } finally {
        setDeletingTemplateId(null);
      }
    },
    [loadTemplates],
  );

  const addAgendaGroup = useCallback(() => {
    setAgendaConfig((current) => ({
      ...current,
      groups: [
        ...current.groups,
        {
          id: makeClientId("agenda_group"),
          title: `Nova agenda ${current.groups.length + 1}`,
          description: "Explique quando essa agenda deve ser usada.",
          buttonLabel: "Ver horarios",
          introMessage:
            "Esses sao os horarios disponiveis para {{agenda_nome}}.\n\n{{agenda_slots}}",
          emptyMessage: "No momento nao ha horarios ativos para essa agenda.",
          slots: [],
        },
      ],
    }));
  }, []);

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
      field: "title" | "description" | "buttonLabel" | "introMessage" | "emptyMessage",
      value: string,
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
      section: "mainMenuButtons" | "recoveryDetectedButtons" | "postActionButtons",
      index: number,
      field: keyof AtendimentoBotButton,
      value: string,
    ) => {
      setBotConfig((current) => ({
        ...current,
        [section]: current[section].map((button, buttonIndex) =>
          buttonIndex === index ? { ...button, [field]: value } : button,
        ),
      }));
    },
    [],
  );

  const addButtonSection = useCallback(
    (section: "mainMenuButtons" | "recoveryDetectedButtons" | "postActionButtons") => {
      const fallback = actionOptions[0] || { value: "talk_human", label: "Falar com atendente" };
      setBotConfig((current) => ({
        ...current,
        [section]: [
          ...current[section],
          {
            actionId: fallback.value,
            title: fallback.label.split(" • ")[0],
          },
        ],
      }));
    },
    [actionOptions],
  );

  const removeButtonSection = useCallback(
    (
      section: "mainMenuButtons" | "recoveryDetectedButtons" | "postActionButtons",
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
    <DashboardScaffold
      title="Atendimento"
      description="Parede real entre Atendimento, Agenda e Recovery, com editor do bot isolado e 100% controlavel."
      actions={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={refreshWorkspace}>
            Atualizar tudo
          </button>
          <button
            type="button"
            onClick={simulateMessage}
            disabled={simulating}
            className="btn btn-primary btn-sm"
          >
            {simulating ? "Simulando..." : "Simular mensagem"}
          </button>
        </>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? (
        <div
          className={`${styles.inlineNote} ${
            notice.tone === "success" ? styles.inlineSuccess : styles.inlineError
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <section className={styles.dashboardGrid}>
        <article className={`${styles.workspaceCard} ${styles.workspaceCardWide}`}>
          <div className={recoveryStyles.heroTabGroup} role="tablist" aria-label="Guias do Atendimento">
            {TAB_ITEMS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === activeTab}
                className={tab.id === activeTab ? recoveryStyles.heroTabActive : recoveryStyles.heroTab}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <p className={styles.tabDescription}>{selectedTab.description}</p>
        </article>

        <article className={styles.workspaceCard}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.sectionEyebrow}>Radar operacional</p>
              <h3>Prioridades em tempo real</h3>
              <small>
                Conversas do Atendimento que pedem acao agora e clientes detectados com contexto de
                Recovery.
              </small>
            </div>
            <span className={styles.pulseBadge}>
              {lastRefreshedAt ? formatDateLabel(lastRefreshedAt, mounted) : "Aguardando leitura"}
            </span>
          </div>

          <div className={styles.priorityList}>
            {priorityConversations.length === 0 ? (
              <div className={styles.emptyState}>Nenhuma prioridade encontrada agora.</div>
            ) : (
              priorityConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={styles.priorityItem}
                  onClick={() => {
                    setActiveTab("messages");
                    void loadConversation(conversation.id);
                  }}
                >
                  <div>
                    <strong>{conversation.customer.name || conversation.customer.phone}</strong>
                    <p>{getMessagePreview(conversation.messages?.[0])}</p>
                  </div>
                  <div className={styles.priorityMeta}>
                    <span
                      className={
                        conversation.routeTarget === "recovery"
                          ? styles.routeRecovery
                          : styles.routeAtendimento
                      }
                    >
                      {conversation.routeTarget === "recovery" ? "Recovery" : "Atendimento"}
                    </span>
                    <span>{formatDateLabel(conversation.updatedAt, mounted)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </article>
      </section>

      {activeTab === "messages" || activeTab === "customers" ? (
        <section className={styles.workspaceCard}>
          <div className={styles.tableFilters}>
            <label className={styles.fieldBlock}>
              <span>Buscar por nome, telefone ou contexto</span>
              <input
                className="field"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Digite cliente, telefone ou observacao"
              />
            </label>
            <label className={styles.fieldBlock}>
              <span>Status</span>
              <select
                className="field"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              >
                <option value="all">Todos</option>
                <option value="new">Novas</option>
                <option value="open">Em humano</option>
                <option value="closed">Encerradas</option>
                <option value="blocked">Bloqueadas</option>
              </select>
            </label>
            <label className={styles.fieldBlock}>
              <span>Destino</span>
              <select
                className="field"
                value={routeFilter}
                onChange={(event) => setRouteFilter(event.target.value as RouteFilter)}
              >
                <option value="all">Tudo</option>
                <option value="atendimento">Atendimento</option>
                <option value="recovery">Recovery</option>
              </select>
            </label>
            <div className={styles.footerActions}>
              <button type="button" className="btn btn-secondary" onClick={() => loadConversations()}>
                Atualizar fila
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "messages" ? (
        <section className={styles.messageGrid}>
          <article className={styles.workspaceCard}>
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.sectionEyebrow}>Inbox do Atendimento</p>
                <h3>Mensagens recebidas</h3>
                <small>
                  Tudo entra aqui primeiro. Se encontrar debito, o card mostra a parede e direciona
                  para o HBX Recovery.
                </small>
              </div>
              <span className={styles.pulseBadge}>
                {pendingAtendimentoCount} aguardando leitura humana
              </span>
            </div>

            <div className={styles.conversationList}>
              {loadingList ? (
                <div className={styles.emptyState}>Carregando conversas...</div>
              ) : filteredConversations.length === 0 ? (
                <div className={styles.emptyState}>Nenhuma conversa encontrada para este filtro.</div>
              ) : (
                filteredConversations.map((conversation) => {
                  const active = conversation.id === selectedId;
                  const latestMessage = conversation.messages?.[0];
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      className={`${styles.conversationItem} ${
                        active ? styles.conversationItemActive : ""
                      }`}
                      onClick={() => loadConversation(conversation.id)}
                    >
                      <div className={styles.conversationHead}>
                        <div>
                          <strong>{conversation.customer.name || conversation.customer.phone}</strong>
                          <small>{conversation.customer.phone}</small>
                        </div>
                        <div className={styles.detailMeta}>
                          <span
                            className={
                              conversation.routeTarget === "recovery"
                                ? styles.routeRecovery
                                : styles.routeAtendimento
                            }
                          >
                            {conversation.routeTarget === "recovery" ? "Recovery" : "Atendimento"}
                          </span>
                          {conversation.status === "blocked" ? (
                            <span className={styles.blockTag}>Bloqueado</span>
                          ) : null}
                        </div>
                      </div>
                      <p>{getMessagePreview(latestMessage)}</p>
                      <div className={styles.conversationFoot}>
                        <span>{conversation.routeReason}</span>
                        <span>{formatDateLabel(conversation.updatedAt, mounted)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </article>

          <article className={styles.workspaceCard}>
            {loadingConversation ? (
              <div className={styles.emptyState}>Carregando conversa...</div>
            ) : !selectedConversation ? (
              <div className={styles.emptyState}>
                Selecione uma conversa para ver timeline, status e a parede de roteamento.
              </div>
            ) : (
              <>
                <div className={styles.sectionHead}>
                  <div>
                    <p className={styles.sectionEyebrow}>Conversa ativa</p>
                    <h3>{selectedConversation.customer.name || selectedConversation.customer.phone}</h3>
                    <small>{selectedConversation.customer.phone}</small>
                  </div>
                  <div className={styles.detailMeta}>
                    <span
                      className={
                        selectedConversation.routeTarget === "recovery"
                          ? styles.routeRecovery
                          : styles.routeAtendimento
                      }
                    >
                      {selectedConversation.routeTarget === "recovery"
                        ? "Cliente no Recovery"
                        : "Cliente no Atendimento"}
                    </span>
                    {selectedConversation.recoveryOpenAmount > 0 ? (
                      <span className={styles.metaBadge}>
                        {formatCurrency(selectedConversation.recoveryOpenAmount)}
                      </span>
                    ) : null}
                    {selectedConversation.status === "blocked" ? (
                      <span className={styles.blockTag}>Bloqueado</span>
                    ) : null}
                  </div>
                </div>

                <div className={styles.flowList}>
                  <div>
                    <strong>Parede atual</strong>
                    <span>{selectedConversation.routeReason}</span>
                  </div>
                  <div>
                    <strong>Status</strong>
                    <span>{selectedStatus}</span>
                  </div>
                  <div>
                    <strong>Ultima atualizacao</strong>
                    <span>{formatDateLabel(selectedConversation.updatedAt, mounted)}</span>
                  </div>
                  <div>
                    <strong>Etapa Recovery</strong>
                    <span>{selectedConversation.recoveryCurrentStep || "Sem etapa ativa"}</span>
                  </div>
                </div>

                <div className={styles.actionBar}>
                  {selectedConversation.routeTarget === "recovery" ? (
                    <Link href="/hbx-recovery" className="btn btn-primary btn-sm">
                      Abrir HBX Recovery
                    </Link>
                  ) : null}

                  {!selectedBlocked && !selectedRouteIsRecovery ? (
                    <>
                      <button
                        type="button"
                        className={`btn btn-sm ${
                          selectedStatus === "open" ? "btn-primary" : "btn-secondary"
                        }`}
                        onClick={() => updateStatus("open")}
                      >
                        Assumir humano
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${
                          selectedStatus === "new" ? "btn-primary" : "btn-secondary"
                        }`}
                        onClick={() => updateStatus("new")}
                      >
                        Voltar ao bot
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${
                          selectedStatus === "closed" ? "btn-primary" : "btn-secondary"
                        }`}
                        onClick={() => updateStatus("closed")}
                      >
                        Encerrar conversa
                      </button>
                    </>
                  ) : null}

                  {selectedBlocked ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={unblockConversation}>
                      Desbloquear contato
                    </button>
                  ) : (
                    <button type="button" className="btn btn-danger btn-sm" onClick={blockConversation}>
                      Bloquear contato
                    </button>
                  )}
                </div>

                {selectedRouteIsRecovery ? (
                  <div className={styles.inlineNote}>
                    Este cliente foi reconhecido no Recovery. A conversa deve seguir no modulo de
                    cobranca para nao misturar respostas, historico e acoes humanas.
                  </div>
                ) : null}

                {selectedBlocked ? (
                  <div className={`${styles.inlineNote} ${styles.inlineError}`}>
                    Contato bloqueado em {formatDateLabel(selectedConversation.blockedAt, mounted)}.
                    {selectedConversation.blockedReason ? ` Motivo: ${selectedConversation.blockedReason}` : ""}
                  </div>
                ) : null}

                <div className={styles.chatTimeline}>
                  {selectedConversation.messages.length === 0 ? (
                    <div className={styles.emptyState}>Sem mensagens nesta conversa.</div>
                  ) : (
                    selectedConversation.messages.map((message) => (
                      <div key={message.id} className={`${styles.chatBubble} ${getBubbleClass(message)}`}>
                        <p>{getMessagePreview(message)}</p>
                        <div className={styles.chatMeta}>
                          <span>{getMessageMeta(message)}</span>
                          <span>{formatDateLabel(message.createdAt, mounted)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <form className={styles.replyComposer} onSubmit={sendMessage}>
                  <textarea
                    className="field"
                    rows={4}
                    value={sendText}
                    onChange={(event) => setSendText(event.target.value)}
                    placeholder={
                      selectedRouteIsRecovery
                        ? "Conversa roteada para o Recovery. Abra o modulo HBX Recovery para responder."
                        : selectedBlocked
                          ? "Contato bloqueado. Desbloqueie para responder."
                          : "Digite uma resposta manual..."
                    }
                    disabled={selectedRouteIsRecovery || selectedBlocked || sending}
                  />
                  <div className={styles.replyFooter}>
                    <small>
                      {selectedRouteIsRecovery
                        ? "Parede ativa: clientes inadimplentes ficam 100% no Recovery."
                        : "Quando o cliente voltar a falar depois de encerrado, o bot pode reabrir a conversa automaticamente."}
                    </small>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={sending || !sendText.trim() || selectedRouteIsRecovery || selectedBlocked}
                    >
                      {sending ? "Enviando..." : "Enviar resposta"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </article>
        </section>
      ) : null}

      {activeTab === "customers" ? (
        <section className={styles.stackSection}>
          <article className={`panel ${recoveryStyles.sectionCard} ${recoveryStyles.registerTableCard}`}>
            <div className={recoveryStyles.sectionHeader}>
              <div>
                <p className={recoveryStyles.sectionEyebrow}>Tabela de clientes</p>
                <h3 className={recoveryStyles.sectionTitle}>Base operacional do Atendimento</h3>
                <p className={recoveryStyles.sectionDescription}>
                  Equivalente da tabela de inadimplentes, mas agora focada em clientes, rota e
                  prioridade de atendimento.
                </p>
              </div>
              <span className="badge badge-brand">{customerRows.length} clientes</span>
            </div>

            {customerRows.length === 0 ? (
              <div className={styles.emptyState}>Nenhum cliente encontrado neste recorte.</div>
            ) : (
              <div className={recoveryStyles.tableWrap}>
                <table className={recoveryStyles.importPreviewTable}>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Rota</th>
                      <th>Em aberto</th>
                      <th>Conversas</th>
                      <th>Ultima mensagem</th>
                      <th>Ultima atualizacao</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerRows.map((row) => (
                      <tr key={row.phone}>
                        <td className={styles.customerCell}>
                          <strong>{row.customerName}</strong>
                          <span>{row.phone}</span>
                        </td>
                        <td>
                          <div className={styles.detailMeta}>
                            <span
                              className={
                                row.routeTarget === "recovery"
                                  ? styles.routeRecovery
                                  : styles.routeAtendimento
                              }
                            >
                              {row.routeTarget === "recovery" ? "Recovery" : "Atendimento"}
                            </span>
                            {row.blockedCount > 0 ? (
                              <span className={styles.blockTag}>{row.blockedCount} bloqueada(s)</span>
                            ) : null}
                          </div>
                          <small>{row.recoveryCurrentStep || row.routeReason}</small>
                        </td>
                        <td>{row.openAmount > 0 ? formatCurrency(row.openAmount) : "-"}</td>
                        <td>{`${row.activeConversationCount} ativa(s) / ${row.conversationCount} total`}</td>
                        <td>{row.latestPreview}</td>
                        <td>{formatDateLabel(row.updatedAt, mounted)}</td>
                        <td>
                          <div className={styles.footerActions}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setActiveTab("messages");
                                void loadConversation(row.conversationId);
                              }}
                            >
                              Abrir conversa
                            </button>
                            {row.routeTarget === "recovery" ? (
                              <Link href={row.recoverySuggestedPath} className="btn btn-primary btn-sm">
                                Recovery
                              </Link>
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
        </section>
      ) : null}

      {activeTab === "templates" ? (
        <TemplatesPanel
          loadingTemplates={loadingTemplates}
          syncingTemplates={syncingTemplates}
          metaTemplates={metaTemplates}
          templateComposer={templateComposer}
          creatingTemplate={creatingTemplate}
          deletingTemplateId={deletingTemplateId}
          onReload={() => {
            setNotice(null);
            void loadTemplates();
          }}
          onSync={() => {
            setNotice(null);
            void syncTemplates();
          }}
          onToggleActivation={(template, active) => {
            setNotice(null);
            void toggleTemplateActivation(template, active);
          }}
          onComposerChange={(updater) => setTemplateComposer((current) => updater(current))}
          onCreateTemplate={() => {
            setNotice(null);
            void createTemplate();
          }}
          onDeleteTemplate={(template) => {
            setNotice(null);
            void deleteTemplate(template);
          }}
        />
      ) : null}

      {activeTab === "agenda" ? (
        <AgendaPanel
          agendaConfig={agendaConfig}
          loadingAgenda={loadingAgenda}
          savingAgenda={savingAgenda}
          onAddGroup={addAgendaGroup}
          onRemoveGroup={removeAgendaGroup}
          onSave={() => {
            setNotice(null);
            void saveAgenda();
          }}
          onUpdateGroup={updateAgendaGroup}
          onAddSlot={addAgendaSlot}
          onRemoveSlot={removeAgendaSlot}
          onUpdateSlot={updateAgendaSlot}
        />
      ) : null}

      {activeTab === "bot" ? (
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
      ) : null}

      {showAttentionCard && selectedPendingPreview ? (
        <div className={styles.attentionPopup}>
          <div className={styles.attentionCard}>
            <div className={styles.attentionHeader}>
              <div>
                <p className={styles.attentionEyebrow}>Nova mensagem no Atendimento</p>
                <strong>{selectedPendingPreview.customer.name || selectedPendingPreview.customer.phone}</strong>
              </div>
              <button
                type="button"
                className={styles.closePopupButton}
                onClick={() => setShowAttentionCard(false)}
              >
                Fechar
              </button>
            </div>
            <p className={styles.attentionPreview}>
              {getMessagePreview(selectedPendingPreview.messages?.[0])}
            </p>
            <div className={styles.footerActions}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setActiveTab("messages");
                  setShowAttentionCard(false);
                  void loadConversation(selectedPendingPreview.id);
                }}
              >
                Abrir fila agora
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardScaffold>
  );
}
