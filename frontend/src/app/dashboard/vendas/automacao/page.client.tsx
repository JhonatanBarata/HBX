"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { QR_PAIRED_EVENT } from "@/components/QrPairedNextStepPrompt";
import {
  getBotAiPlanRedirectFromError,
  hasBotAi,
  type CommercialPlansPayload,
} from "@/lib/commercial-plans";
import { getProviderCapabilitiesFromWhatsAppCenter } from "@/lib/provider-capabilities";
import type { UserModule } from "@/lib/hbx-modules";
import {
  getWhatsAppModalPlanRedirect,
  whatsappModeLabel,
  type WhatsAppCenterPayload,
  type WhatsAppModalPayload,
} from "@/lib/whatsapp-center";
import { apiFetch } from "../../_lib/api";
import { useRequireAuth } from "../../_lib/useRequireAuth";
import {
  DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  DEFAULT_ATENDIMENTO_BOT_CONFIG,
  normalizeAgendaConfig,
  normalizeBotConfig,
  type AtendimentoAgendaConfig,
  type AtendimentoBotConfig,
} from "../../inbox/inbox-model";
import BotQrConnectionCard from "./_components/BotQrConnectionCard";
import BotQrPublishPanel from "./_components/BotQrPublishPanel";
import ConversationBuilder from "./_components/ConversationBuilder";
import BotQrWorkspace from "./_components/BotQrWorkspace";
import {
  buildPublicationChecklist,
  buildQuickTestCases,
  type BotQrWorkspaceTab,
} from "./model";
import styles from "./page.module.css";

type NoticeState = {
  tone: "success" | "error" | "info";
  text: string;
};

type StoredDraft = {
  config: AtendimentoBotConfig;
  savedAt: string;
};

const DRAFT_STORAGE_KEY = "hbx.vendas.automacao.bot-qrcode.draft.v1";
const BOT_PLAN_HREF = "/dashboard/planos?intent=bot_ia&from=vendas_automacao";

function shouldLoadModalQr(nextPayload: WhatsAppModalPayload | null, includeQr: boolean) {
  if (!includeQr || !nextPayload?.data.available) return false;
  return nextPayload.status !== "connected";
}

function mergeModalPayload(
  statusPayload: WhatsAppModalPayload,
  qrPayload: WhatsAppModalPayload,
): WhatsAppModalPayload {
  if (qrPayload.data.qrCodeDataUrl || qrPayload.status === "connected") {
    return {
      ...qrPayload,
      data: {
        ...statusPayload.data,
        ...qrPayload.data,
      },
    };
  }

  return {
    ...statusPayload,
    data: {
      ...statusPayload.data,
      updatedAt: qrPayload.data.updatedAt || statusPayload.data.updatedAt,
      lastError: qrPayload.data.lastError || statusPayload.data.lastError,
      qrCodeDataUrl: qrPayload.data.qrCodeDataUrl || null,
    },
  };
}

function formatLabel(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) return "-";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readStoredDraft(): StoredDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { config?: AtendimentoBotConfig; savedAt?: string };
    if (!parsed?.config) return null;
    return {
      config: normalizeBotConfig(parsed.config),
      savedAt: String(parsed.savedAt || new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

function writeStoredDraft(config: AtendimentoBotConfig) {
  if (typeof window === "undefined") return null;
  const savedAt = new Date().toISOString();
  window.localStorage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify({ config: normalizeBotConfig(config), savedAt }),
  );
  return savedAt;
}

function clearStoredDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
}

export default function VendasAutomationClientPage() {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [connectionAction, setConnectionAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [activeTab, setActiveTab] = useState<BotQrWorkspaceTab>("flow");
  const [connectionPaired, setConnectionPaired] = useState(false);
  const [draftConfig, setDraftConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [publishedConfig, setPublishedConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [agendaConfig, setAgendaConfig] = useState<AtendimentoAgendaConfig>(DEFAULT_ATENDIMENTO_AGENDA_CONFIG);
  const [centerPayload, setCenterPayload] = useState<WhatsAppCenterPayload | null>(null);
  const [modalPayload, setModalPayload] = useState<WhatsAppModalPayload | null>(null);
  const [commercialPlans, setCommercialPlans] = useState<CommercialPlansPayload | null>(null);
  const [userModules, setUserModules] = useState<UserModule[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [lastQuickTestAt, setLastQuickTestAt] = useState<string | null>(null);
  const previousConnectionStatusRef = useRef<WhatsAppModalPayload["status"] | null>(null);

  const draftSignature = useMemo(() => JSON.stringify(draftConfig), [draftConfig]);
  const publishedSignature = useMemo(() => JSON.stringify(publishedConfig), [publishedConfig]);
  const hasUnsavedChanges = draftSignature !== publishedSignature;
  const providerCapabilities = useMemo(
    () => getProviderCapabilitiesFromWhatsAppCenter(centerPayload),
    [centerPayload],
  );
  const botAiActive = hasBotAi(commercialPlans);
  const recoveryEnabled = useMemo(() => {
    const trialModule = String(centerPayload?.company.trialModuleSelection || "").trim().toLowerCase();
    if (trialModule === "recovery") return true;
    return userModules.some((module) => module.accessible && module.key === "hbx_recovery");
  }, [centerPayload?.company.trialModuleSelection, userModules]);

  const checklist = useMemo(
    () =>
      buildPublicationChecklist(draftConfig, agendaConfig, {
        qrModeSelected: centerPayload?.center.mode === "QR",
        modalAvailable: Boolean(modalPayload?.data.available),
        connectionLive: Boolean(modalPayload?.data.qrCodeDataUrl) || modalPayload?.status === "connected",
        providerCapabilities,
        recoveryEnabled,
        hasUnsavedChanges,
      }),
    [agendaConfig, centerPayload?.center.mode, draftConfig, hasUnsavedChanges, modalPayload?.data.available, modalPayload?.data.qrCodeDataUrl, modalPayload?.status, providerCapabilities, recoveryEnabled],
  );
  const quickTests = useMemo(
    () => buildQuickTestCases(draftConfig, agendaConfig),
    [agendaConfig, draftConfig],
  );

  const connectionLabel = useMemo(() => {
    if (connectionLoading) return "Carregando QR";
    if (modalPayload?.status === "connected") return "QR conectado";
    if (modalPayload?.data.qrCodeDataUrl) return "QR pronto para leitura";
    if (modalPayload?.status === "waiting_qr") return "Aguardando leitura";
    return "QR pendente";
  }, [connectionLoading, modalPayload?.data.qrCodeDataUrl, modalPayload?.status]);

  const publishLabel = draftConfig.routingRules.globalBotEnabled ? "Bot ativo" : "BOT_OFF global";

  const openBotPlans = useCallback(() => {
    router.push(BOT_PLAN_HREF);
  }, [router]);

  const handleModalPlanRedirect = useCallback(
    (payload: WhatsAppModalPayload | null) => {
      const redirectTo = getWhatsAppModalPlanRedirect(payload);
      if (!redirectTo) return false;
      setNotice({
        tone: "error",
        text: "Este WhatsApp já utilizou o trial. Para continuar usando o HBX com este número, escolha um plano.",
      });
      router.push(redirectTo);
      return true;
    },
    [router],
  );

  const setWorkspaceTab = useCallback(
    (tab: BotQrWorkspaceTab) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.set("tab", tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const loadConnection = useCallback(async (background = false, includeQr = true) => {
    if (!background) setConnectionLoading(true);
    setConnectionError(null);
    try {
      const centerData = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center");
      const statusData = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/status");
      let nextModal = statusData;

      if (shouldLoadModalQr(statusData, includeQr)) {
        const qrData = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr");
        nextModal = mergeModalPayload(statusData, qrData);
      }

      setCenterPayload(centerData);
      setModalPayload(nextModal);
      handleModalPlanRedirect(nextModal);
    } catch (loadError) {
      setConnectionError(
        loadError instanceof Error ? loadError.message : "Falha ao carregar a conexao QR atual.",
      );
    } finally {
      if (!background) setConnectionLoading(false);
    }
  }, [handleModalPlanRedirect]);

  const loadAutomation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansPayload, agendaPayload] = await Promise.all([
        apiFetch<CommercialPlansPayload>("/commercial-plans/me"),
        apiFetch<AtendimentoAgendaConfig>("/vendas/automation/agenda"),
      ]);
      setCommercialPlans(plansPayload);
      const normalizedAgenda = normalizeAgendaConfig(agendaPayload);
      setAgendaConfig(normalizedAgenda);

      if (!hasBotAi(plansPayload)) {
        setPublishedConfig(DEFAULT_ATENDIMENTO_BOT_CONFIG);
        setDraftConfig(DEFAULT_ATENDIMENTO_BOT_CONFIG);
        setPublishedAt(null);
        setDraftSavedAt(null);
        return;
      }

      const botPayload = await apiFetch<AtendimentoBotConfig>("/vendas/automation/bot-config");
      const normalizedBot = normalizeBotConfig(botPayload);
      const storedDraft = readStoredDraft();

      setPublishedConfig(normalizedBot);
      setPublishedAt(new Date().toISOString());

      if (storedDraft) {
        setDraftConfig(storedDraft.config);
        setDraftSavedAt(storedDraft.savedAt);
        setNotice({
          tone: "info",
          text: "Rascunho local carregado para continuar a edicao da automacao WhatsApp.",
        });
      } else {
        setDraftConfig(normalizedBot);
        setDraftSavedAt(null);
      }
    } catch (loadError) {
      const redirectTo = getBotAiPlanRedirectFromError(loadError, BOT_PLAN_HREF);
      if (redirectTo) {
        setNotice({
          tone: "info",
          text: "O BOT Inteligente faz parte do HBX Vendas + IA.",
        });
        router.push(redirectTo);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a automacao WhatsApp.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const ensureQrModeSelected = useCallback(async () => {
    if (centerPayload?.center.mode === "QR") return centerPayload;
    const next = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center", {
      method: "PATCH",
      body: JSON.stringify({ mode: "QR" }),
    });
    setCenterPayload(next);
    return next;
  }, [centerPayload]);

  const fetchModalQrOnce = useCallback(async (statusPayload: WhatsAppModalPayload) => {
    if (!shouldLoadModalQr(statusPayload, true)) return statusPayload;
    try {
      const qrPayload = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr");
      const merged = mergeModalPayload(statusPayload, qrPayload);
      handleModalPlanRedirect(merged);
      return merged;
    } catch {
      return statusPayload;
    }
  }, [handleModalPlanRedirect]);

  const runConnectionAction = useCallback(
    async (action: "generate_qr" | "reconnect" | "disconnect") => {
      setConnectionAction(action);
      setConnectionError(null);
      try {
        if (action !== "disconnect") {
          await ensureQrModeSelected();
        }

        let response: WhatsAppModalPayload;
        if (action === "generate_qr") {
          response =
            modalPayload?.status === "waiting_qr" && !modalPayload.data.qrCodeDataUrl
              ? await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr")
              : await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/start", {
                  method: "POST",
                });
        } else if (action === "reconnect") {
          response = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/restart", {
            method: "POST",
          });
        } else {
          response = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/disconnect", {
            method: "POST",
          });
        }

        const nextPayload = action === "disconnect" ? response : await fetchModalQrOnce(response);
        setModalPayload(nextPayload);
        if (handleModalPlanRedirect(nextPayload)) return;
        void loadConnection(true, action !== "disconnect");

        setNotice({
          tone: "success",
          text:
            action === "disconnect"
              ? "Conexao QR encerrada."
              : action === "reconnect"
                ? "Reconexao solicitada. Atualizando o QR atual."
                : nextPayload.data.qrCodeDataUrl
                  ? "QR pronto para leitura."
                  : "Sessao QR atualizada.",
        });
      } catch (actionError) {
        const message =
          actionError instanceof Error
            ? actionError.message
            : action === "disconnect"
              ? "Falha ao desconectar o QR."
              : "Falha ao atualizar a conexao QR.";
        setConnectionError(message);
        setNotice({ tone: "error", text: message });
      } finally {
        setConnectionAction(null);
      }
    },
    [ensureQrModeSelected, fetchModalQrOnce, handleModalPlanRedirect, loadConnection, modalPayload],
  );

  useEffect(() => {
    if (hasToken !== true) return;
    void loadAutomation();
    void loadConnection(false, true);
    void apiFetch<UserModule[]>("/modules/me")
      .then((modules) => setUserModules(Array.isArray(modules) ? modules : []))
      .catch(() => setUserModules([]));
  }, [hasToken, loadAutomation, loadConnection]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "flow" || requestedTab === "publish") {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const currentStatus = modalPayload?.status || null;
    const previousStatus = previousConnectionStatusRef.current;
    previousConnectionStatusRef.current = currentStatus;

    if (currentStatus !== "connected" || !previousStatus || previousStatus === "connected") return;

    setConnectionPaired(true);
    window.dispatchEvent(new Event(QR_PAIRED_EVENT));
    const timer = window.setTimeout(() => setConnectionPaired(false), 3200);
    return () => window.clearTimeout(timer);
  }, [modalPayload?.status]);

  useEffect(() => {
    if (!modalPayload?.data.available) return;
    const interval = window.setInterval(() => {
      void loadConnection(true, modalPayload.status !== "connected");
    }, modalPayload.status === "connected" ? 20000 : 8000);
    return () => window.clearInterval(interval);
  }, [loadConnection, modalPayload?.data.available, modalPayload?.status]);

  const handleSaveDraft = useCallback(() => {
    const savedAt = writeStoredDraft(draftConfig);
    setDraftSavedAt(savedAt);
    setNotice({ tone: "success", text: "Rascunho salvo localmente nesta automacao." });
  }, [draftConfig]);

  const saveBotConfig = useCallback(async (nextConfig: AtendimentoBotConfig, successText: string) => {
    if (!botAiActive) {
      setNotice({
        tone: "info",
        text: "O BOT Inteligente faz parte do HBX Vendas + IA.",
      });
      openBotPlans();
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const payload = await apiFetch<AtendimentoBotConfig>("/vendas/automation/bot-config", {
        method: "PATCH",
        body: JSON.stringify(nextConfig),
      });
      const normalized = normalizeBotConfig(payload);
      setDraftConfig(normalized);
      setPublishedConfig(normalized);
      setPublishedAt(new Date().toISOString());
      clearStoredDraft();
      setDraftSavedAt(null);
      setNotice({ tone: "success", text: successText });
    } catch (publishError) {
      const redirectTo = getBotAiPlanRedirectFromError(publishError, BOT_PLAN_HREF);
      if (redirectTo) {
        setNotice({
          tone: "info",
          text: "O BOT Inteligente faz parte do HBX Vendas + IA.",
        });
        router.push(redirectTo);
        return;
      }
      const message =
        publishError instanceof Error ? publishError.message : "Falha ao salvar a automacao WhatsApp.";
      setError(message);
      setNotice({ tone: "error", text: message });
    } finally {
      setPublishing(false);
    }
  }, [botAiActive, openBotPlans, router]);

  const handlePublish = useCallback(
    async () => saveBotConfig(draftConfig, "Automacao WhatsApp publicada com sucesso."),
    [draftConfig, saveBotConfig],
  );

  const handleRestorePublished = useCallback(() => {
    setDraftConfig(publishedConfig);
    clearStoredDraft();
    setDraftSavedAt(null);
    setNotice({ tone: "info", text: "Rascunho local descartado. Ultima publicacao restaurada." });
  }, [publishedConfig]);

  const handleRunQuickTest = useCallback(() => {
    const executedAt = new Date().toISOString();
    const passed = quickTests.filter((item) => item.ok).length;
    setLastQuickTestAt(executedAt);
    setNotice({
      tone: passed === quickTests.length ? "success" : "info",
      text: `Teste rapido executado: ${passed}/${quickTests.length} item(ns) validado(s).`,
    });
  }, [quickTests]);

  const renderBotPlanPaywall = () => (
    <section className={styles.botPlanPaywall}>
      <span className={styles.sectionEyebrow}>Plano necessário</span>
      <h3>O BOT Inteligente faz parte do HBX Vendas + IA</h3>
      <p>Para configurar ou ativar o bot, escolha o plano que mostra o valor antes da ativação.</p>
      <button type="button" className={styles.primaryButton} onClick={openBotPlans}>
        Ver planos
      </button>
    </section>
  );

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Automacao WhatsApp" description="Carregando automacao do modulo Vendas." hideHeader={true}>
        <section className={styles.loadingCard}>Carregando Automacao WhatsApp...</section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Automacao WhatsApp" hideHeader={true}>
      <div className={styles.shell}>
        <div className={styles.backdrop} />
        <div className={styles.page}>
          {notice ? <section className={styles.notice} data-tone={notice.tone}>{notice.text}</section> : null}
          {error ? <section className={styles.notice} data-tone="error">{error}</section> : null}
          {loading ? (
            <section className={styles.loadingCard}>Carregando configuracao atual da Automacao WhatsApp...</section>
          ) : (
            <BotQrWorkspace
              activeTab={activeTab}
              onTabChange={setWorkspaceTab}
              connectionPaired={connectionPaired}
              connectionPanel={
                <BotQrConnectionCard
                  loading={connectionLoading}
                  actionLoading={connectionAction}
                  error={connectionError}
                  statusLabel={connectionLabel}
                  centerModeLabel={whatsappModeLabel(centerPayload?.center.mode || "")}
                  mainNote={
                    modalPayload?.data.qrCodeDataUrl
                      ? "QR pronto. Abra o WhatsApp no celular e leia o codigo nesta mesma tela."
                      : modalPayload?.status === "connected"
                        ? "Numero conectado e pronto para receber inbound real do QR-first."
                        : "Este e o trilho principal agora. Gere ou renove o QR sem sair do modulo Vendas."
                  }
                  phone={modalPayload?.data.phone || null}
                  updatedAt={modalPayload?.data.updatedAt || centerPayload?.center.qrConnection.lastSyncAt || null}
                  connectedAt={modalPayload?.data.connectedAt || centerPayload?.center.qrConnection.connectedAt || null}
                  qrCodeDataUrl={modalPayload?.data.qrCodeDataUrl || null}
                  isQrPrimary={centerPayload?.center.mode === "QR"}
                  onGenerateQr={() => void runConnectionAction("generate_qr")}
                  onReconnect={() => void runConnectionAction("reconnect")}
                  onDisconnect={() => void runConnectionAction("disconnect")}
                  onRefresh={() => void loadConnection(false, true)}
                />
              }
              flowPanel={
                botAiActive ? (
                  <ConversationBuilder
                    botConfig={draftConfig}
                    agendaConfig={agendaConfig}
                    providerCapabilities={providerCapabilities}
                    publishing={publishing}
                    recoveryEnabled={recoveryEnabled}
                    hasUnsavedChanges={hasUnsavedChanges}
                    onConfigChange={setDraftConfig}
                    onSaveDraft={handleSaveDraft}
                    onSave={(nextConfig) => void saveBotConfig(nextConfig, "Bot publicado.")}
                  />
                ) : renderBotPlanPaywall()
              }
              publishPanel={
                botAiActive ? (
                  <BotQrPublishPanel
                    checklist={checklist}
                    quickTests={quickTests}
                    draftSavedAtLabel={formatLabel(draftSavedAt)}
                    publishedAtLabel={formatLabel(publishedAt)}
                    lastQuickTestLabel={formatLabel(lastQuickTestAt)}
                    publishing={publishing}
                    hasUnsavedChanges={hasUnsavedChanges}
                    botStatusLabel={publishLabel}
                    connectionStatusLabel={connectionLabel}
                    onSaveDraft={handleSaveDraft}
                    onPublish={() => void handlePublish()}
                    onRestorePublished={handleRestorePublished}
                    onRunQuickTest={handleRunQuickTest}
                  />
                ) : renderBotPlanPaywall()
              }
            />
          )}
        </div>
      </div>
    </DashboardScaffold>
  );
}
