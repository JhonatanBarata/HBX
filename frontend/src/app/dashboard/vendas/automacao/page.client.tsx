"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { QR_PAIRED_EVENT } from "@/components/QrPairedNextStepPrompt";
import {
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
  type AtendimentoBotButton,
  type AtendimentoBotConfig,
} from "../../inbox/inbox-model";
import BotQrConnectionCard from "./_components/BotQrConnectionCard";
import BotQrFlowStrip from "./_components/BotQrFlowStrip";
import BotQrHero from "./_components/BotQrHero";
import BotQrPublishPanel from "./_components/BotQrPublishPanel";
import BotQrSimpleEditor from "./_components/BotQrSimpleEditor";
import BotQrWorkspace from "./_components/BotQrWorkspace";
import {
  BOT_QR_FLOW_STRIP,
  BOT_QR_PREVIEW_SCENARIOS,
  buildActionOptions,
  buildEditorBlocks,
  buildPublicationChecklist,
  buildQuickTestCases,
  buildScenarioPreview,
  type BotQrButtonField,
  type BotQrPreviewScenarioId,
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

function makeButtonId(field: string, index: number) {
  return `${field}_${Date.now()}_${index + 1}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_:-]/g, "")
    .slice(0, 80);
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

function updateButtonField(
  config: AtendimentoBotConfig,
  field: BotQrButtonField,
  updater: (buttons: AtendimentoBotButton[]) => AtendimentoBotButton[],
) {
  return {
    ...config,
    [field]: updater([...(config[field] as AtendimentoBotButton[])]),
  };
}

export default function VendasAutomationClientPage() {
  const hasToken = useRequireAuth();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [connectionAction, setConnectionAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [activeTab, setActiveTab] = useState<BotQrWorkspaceTab>("connection");
  const [connectionPaired, setConnectionPaired] = useState(false);
  const [draftConfig, setDraftConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [publishedConfig, setPublishedConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [agendaConfig, setAgendaConfig] = useState<AtendimentoAgendaConfig>(DEFAULT_ATENDIMENTO_AGENDA_CONFIG);
  const [selectedBlockId, setSelectedBlockId] = useState("entryGreeting");
  const [previewScenarioId, setPreviewScenarioId] = useState<BotQrPreviewScenarioId>("new_customer");
  const [centerPayload, setCenterPayload] = useState<WhatsAppCenterPayload | null>(null);
  const [modalPayload, setModalPayload] = useState<WhatsAppModalPayload | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [lastQuickTestAt, setLastQuickTestAt] = useState<string | null>(null);
  const previousConnectionStatusRef = useRef<WhatsAppModalPayload["status"] | null>(null);

  const draftSignature = useMemo(() => JSON.stringify(draftConfig), [draftConfig]);
  const publishedSignature = useMemo(() => JSON.stringify(publishedConfig), [publishedConfig]);
  const hasUnsavedChanges = draftSignature !== publishedSignature;

  const actionOptions = useMemo(
    () => buildActionOptions(draftConfig, agendaConfig),
    [agendaConfig, draftConfig],
  );
  const blocks = useMemo(
    () => buildEditorBlocks(draftConfig, agendaConfig),
    [agendaConfig, draftConfig],
  );
  const previewMessages = useMemo(
    () => buildScenarioPreview(draftConfig, previewScenarioId),
    [draftConfig, previewScenarioId],
  );
  const checklist = useMemo(
    () =>
      buildPublicationChecklist(draftConfig, agendaConfig, {
        qrModeSelected: centerPayload?.center.mode === "QR",
        modalAvailable: Boolean(modalPayload?.data.available),
        connectionLive: Boolean(modalPayload?.data.qrCodeDataUrl) || modalPayload?.status === "connected",
      }),
    [agendaConfig, centerPayload?.center.mode, draftConfig, modalPayload?.data.available, modalPayload?.data.qrCodeDataUrl, modalPayload?.status],
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

  const flowLabel = hasUnsavedChanges ? "Rascunho em edicao" : "Fluxo alinhado";
  const publishLabel = draftConfig.routingRules.globalBotEnabled ? "Bot ativo" : "BOT_OFF global";

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
    } catch (loadError) {
      setConnectionError(
        loadError instanceof Error ? loadError.message : "Falha ao carregar a conexao QR atual.",
      );
    } finally {
      if (!background) setConnectionLoading(false);
    }
  }, []);

  const loadAutomation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [botPayload, agendaPayload] = await Promise.all([
        apiFetch<AtendimentoBotConfig>("/vendas/automation/bot-config"),
        apiFetch<AtendimentoAgendaConfig>("/vendas/automation/agenda"),
      ]);
      const normalizedBot = normalizeBotConfig(botPayload);
      const normalizedAgenda = normalizeAgendaConfig(agendaPayload);
      const storedDraft = readStoredDraft();

      setPublishedConfig(normalizedBot);
      setAgendaConfig(normalizedAgenda);
      setPublishedAt(new Date().toISOString());

      if (storedDraft) {
        setDraftConfig(storedDraft.config);
        setDraftSavedAt(storedDraft.savedAt);
        setNotice({
          tone: "info",
          text: "Rascunho local carregado para continuar a edicao do Bot QRCode.",
        });
      } else {
        setDraftConfig(normalizedBot);
        setDraftSavedAt(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a automacao do modulo Vendas.");
    } finally {
      setLoading(false);
    }
  }, []);

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
      return mergeModalPayload(statusPayload, qrPayload);
    } catch {
      return statusPayload;
    }
  }, []);

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
    [ensureQrModeSelected, fetchModalQrOnce, loadConnection, modalPayload],
  );

  useEffect(() => {
    if (hasToken !== true) return;
    void loadAutomation();
    void loadConnection(false, true);
  }, [hasToken, loadAutomation, loadConnection]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "connection" || requestedTab === "flow" || requestedTab === "publish") {
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

  useEffect(() => {
    if (!blocks.length) return;
    if (blocks.some((block) => block.id === selectedBlockId)) return;
    setSelectedBlockId(blocks[0].id);
  }, [blocks, selectedBlockId]);

  const handleMessageChange = useCallback(
    (blockId: string, value: string) => {
      const block = blocks.find((item) => item.id === blockId);
      if (!block?.messageField) return;
      setDraftConfig((current) => ({
        ...current,
        [block.messageField]: value,
      }));
    },
    [blocks],
  );

  const handleButtonTitleChange = useCallback(
    (blockId: string, index: number, value: string) => {
      const block = blocks.find((item) => item.id === blockId);
      if (!block?.buttonsField) return;
      setDraftConfig((current) =>
        updateButtonField(current, block.buttonsField as BotQrButtonField, (buttons) =>
          buttons.map((button, buttonIndex) =>
            buttonIndex === index ? { ...button, title: value } : button,
          ),
        ),
      );
    },
    [blocks],
  );

  const handleButtonActionChange = useCallback(
    (blockId: string, index: number, actionId: string) => {
      const block = blocks.find((item) => item.id === blockId);
      if (!block?.buttonsField) return;
      const selectedAction = actionOptions.find((option) => option.value === actionId) || actionOptions[0] || null;
      if (!selectedAction) return;

      setDraftConfig((current) =>
        updateButtonField(current, block.buttonsField as BotQrButtonField, (buttons) =>
          buttons.map((button, buttonIndex) =>
            buttonIndex === index
              ? {
                  ...button,
                  actionId: selectedAction.value,
                  nextNodeId: selectedAction.nextNodeId,
                }
              : button,
          ),
        ),
      );
    },
    [actionOptions, blocks],
  );

  const handleAddButton = useCallback(
    (blockId: string) => {
      const block = blocks.find((item) => item.id === blockId);
      const selectedAction = actionOptions.find((option) => option.enabled) || actionOptions[0] || null;
      if (!block?.buttonsField || !selectedAction) return;

      setDraftConfig((current) =>
        updateButtonField(current, block.buttonsField as BotQrButtonField, (buttons) => [
          ...buttons,
          {
            buttonId: makeButtonId(String(block.buttonsField), buttons.length),
            actionId: selectedAction.value,
            title: selectedAction.label.replace(/^Agenda • /, ""),
            nextNodeId: selectedAction.nextNodeId,
          },
        ]),
      );
    },
    [actionOptions, blocks],
  );

  const handleRemoveButton = useCallback(
    (blockId: string, index: number) => {
      const block = blocks.find((item) => item.id === blockId);
      if (!block?.buttonsField) return;
      setDraftConfig((current) =>
        updateButtonField(current, block.buttonsField as BotQrButtonField, (buttons) =>
          buttons.filter((_, buttonIndex) => buttonIndex !== index),
        ),
      );
    },
    [blocks],
  );

  const handleToggleFinance = useCallback((enabled: boolean) => {
    setDraftConfig((current) => ({
      ...current,
      routingRules: {
        ...current.routingRules,
        checkRecoveryBeforeReply: enabled,
        autoRouteDebtorsToRecovery: enabled,
      },
    }));
  }, []);

  const handleToggleBotOff = useCallback((enabled: boolean) => {
    setDraftConfig((current) => ({
      ...current,
      routingRules: {
        ...current.routingRules,
        globalBotEnabled: !enabled,
      },
    }));
  }, []);

  const handleSaveDraft = useCallback(() => {
    const savedAt = writeStoredDraft(draftConfig);
    setDraftSavedAt(savedAt);
    setNotice({ tone: "success", text: "Rascunho salvo localmente nesta operacao." });
  }, [draftConfig]);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    setError(null);
    try {
      const payload = await apiFetch<AtendimentoBotConfig>("/vendas/automation/bot-config", {
        method: "PATCH",
        body: JSON.stringify(draftConfig),
      });
      const normalized = normalizeBotConfig(payload);
      setDraftConfig(normalized);
      setPublishedConfig(normalized);
      setPublishedAt(new Date().toISOString());
      clearStoredDraft();
      setDraftSavedAt(null);
      setNotice({ tone: "success", text: "Bot QRCode publicado com sucesso." });
    } catch (publishError) {
      const message =
        publishError instanceof Error ? publishError.message : "Falha ao publicar o Bot QRCode.";
      setError(message);
      setNotice({ tone: "error", text: message });
    } finally {
      setPublishing(false);
    }
  }, [draftConfig]);

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
      text: `Teste rapido executado: ${passed}/${quickTests.length} cenario(s) validado(s).`,
    });
  }, [quickTests]);

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Automacao QRCode" description="Carregando automacao do modulo Vendas." hideHeader={true}>
        <section className={styles.loadingCard}>Carregando Bot QRCode...</section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Automacao QRCode" hideHeader={true}>
      <div className={styles.shell}>
        <div className={styles.backdrop} />
        <div className={styles.page}>
          {loading ? (
            <section className={styles.loadingCard}>Carregando configuracao atual do Bot QRCode...</section>
          ) : (
            <BotQrWorkspace
              activeTab={activeTab}
              onTabChange={setActiveTab}
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
                <BotQrSimpleEditor
                  blocks={blocks}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={setSelectedBlockId}
                  actionOptions={actionOptions}
                  previewScenarioId={previewScenarioId}
                  previewScenarios={BOT_QR_PREVIEW_SCENARIOS}
                  previewMessages={previewMessages}
                  onPreviewScenarioChange={setPreviewScenarioId}
                  onMessageChange={handleMessageChange}
                  onButtonTitleChange={handleButtonTitleChange}
                  onButtonActionChange={handleButtonActionChange}
                  onAddButton={handleAddButton}
                  onRemoveButton={handleRemoveButton}
                  onToggleFinance={handleToggleFinance}
                  onToggleBotOff={handleToggleBotOff}
                />
              }
              publishPanel={
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
              }
            />
          )}
        </div>
      </div>
    </DashboardScaffold>
  );
}
