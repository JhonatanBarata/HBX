"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent as ReactChangeEvent,
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BotStudioTemplateStart } from "@/components/bot-editor/BotMessageStudio";
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
import ConversationActionList from "@/components/workspace/ConversationActionList";
import ConversationBadgeList from "@/components/workspace/ConversationBadgeList";
import ConversationContextPanel from "@/components/workspace/ConversationContextPanel";
import ConversationListPane from "@/components/workspace/ConversationListPane";
import ConversationMainPane from "@/components/workspace/ConversationMainPane";
import ConversationQueueFilterBar from "@/components/workspace/ConversationQueueFilterBar";
import ConversationWorkspaceStatus from "@/components/workspace/ConversationWorkspaceStatus";
import ConversationWorkspaceShell from "@/components/workspace/ConversationWorkspaceShell";
import {
  buildRecoveryFinancialSummary,
  buildRecoveryQuickActions,
  buildRecoveryQueueBadges,
  buildRecoveryThreadBadges,
  getRecoveryQueueLabel,
  getRecoveryThreadAvatarMeta,
  mapRecoveryFlowStepLabel,
  mapRecoveryQueueTone,
} from "@/components/workspace/adapters/recovery";
import type {
  WorkspacePanelDescriptor,
} from "@/components/workspace/types";
import {
  SHARED_CONVERSATION_WORKSPACE_IDS,
  buildSharedConversationWorkspacePanels,
} from "@/components/workspace/conversation-workspace";
import { useRequireAuth } from "../dashboard/_lib/useRequireAuth";
import { apiFetch } from "../dashboard/_lib/api";
import AnimatedNumber from "./_components/AnimatedNumber";
import ClientDrawer, { type DrawerActionId } from "./_components/ClientDrawer";
import RecoveryBotStudio from "./_components/RecoveryBotStudio";
import {
  buildRecoveryOverview,
  type RecoveryBotActionGuide,
  type RecoveryBotActionId,
  type RecoveryBotButton,
  calculateRiskScore,
  type RecoveryBotConfig,
  type RecoveryBotVariableDefinition,
  type RecoveryCustomer,
  type RecoveryFlowStage,
  type RecoveryInteractionConversation,
  type RecoveryInteractionDetail,
  type RecoveryInteractionMessage,
  type RecoveryInteractionSummary,
  type RecoveryLayoutConfig,
  type RecoveryMetaHeaderUploadPayload,
  type RecoveryMetaTemplateItem,
  type RecoveryMetaTemplatesPayload,
  type RecoveryPaymentHistorySummary,
  type RecoveryPaymentLifecycle,
  type RecoveryRiskTone,
} from "./recovery-model";
import styles from "./page.module.css";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getScoreClass(tone: RecoveryRiskTone) {
  if (tone === "high") return styles.scoreHigh;
  if (tone === "medium") return styles.scoreMedium;
  return styles.scoreLow;
}

function normalizeWhatsAppNumber(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return `+${digits}`;
}

function getLiveInteractionPhone(input: {
  conversationWhatsapp?: string | null;
  customerWhatsapp?: string | null;
}) {
  return String(input.conversationWhatsapp || input.customerWhatsapp || "").trim();
}

function getRecoveryInteractionFreshness(input: {
  lastAt?: string | null;
  lastInteractionAt?: string | null;
}) {
  return String(input.lastInteractionAt || input.lastAt || "").trim();
}

function shouldReloadRecoveryInteraction(
  summary?: RecoveryInteractionConversation | null,
  detail?: RecoveryInteractionDetail | null,
) {
  if (!summary) return false;
  if (!detail) return true;
  if (summary.conversationId !== detail.conversationId) return true;
  return getRecoveryInteractionFreshness(summary) !== getRecoveryInteractionFreshness(detail);
}

function buildRecoveryInteractionSkeleton(
  summary?: RecoveryInteractionConversation | null,
  current?: RecoveryInteractionDetail | null,
): RecoveryInteractionDetail | null {
  if (!summary && !current) return null;
  if (!summary) return current || null;
  return {
    conversationId: summary.conversationId,
    botActive: summary.botActive,
    humanAssigned: summary.humanAssigned,
    isBlocked: summary.isBlocked,
    blockedAt: summary.blockedAt ?? null,
    blockedReason: summary.blockedReason ?? null,
    assignedUserId: summary.assignedUserId,
    currentFlow: summary.currentFlow,
    currentStep: summary.currentStep,
    flowResult: summary.flowResult,
    metadata: summary.metadata || {},
    lastInteractionAt: summary.lastInteractionAt,
    customer: {
      id: summary.customerId,
      name: summary.customerName || current?.customer?.name || "Cliente",
      whatsappNumber: summary.customerWhatsapp || current?.customer?.whatsappNumber || "",
      conversationWhatsapp:
        summary.conversationWhatsapp || current?.customer?.conversationWhatsapp || "",
      openAmount: summary.openAmount || current?.customer?.openAmount || 0,
      status: summary.customerStatus || current?.customer?.status || "UNKNOWN",
    },
    latestPayment: current?.conversationId === summary.conversationId ? current.latestPayment : null,
    messages:
      current?.conversationId === summary.conversationId
        ? current.messages
        : summary.lastMessage
          ? [
              {
                id: -summary.conversationId,
                direction: summary.lastDirection || "OUTBOUND",
                messageType: "summary_preview",
                senderType:
                  String(summary.lastDirection || "").trim().toUpperCase() === "INBOUND"
                    ? "client"
                    : "bot",
                body: summary.lastMessage,
                variables: {},
                status: "delivered",
                sourceModule: summary.lastSourceModule || "recovery",
                isComplaint: false,
                timestamp: summary.lastAt,
              },
            ]
          : [],
  };
}

const RECOVERY_HUMAN_QUEUE_EVENT = "hbx-recovery-human-queue";

type RecoveryHumanAttentionKind = "human_queue" | "new_message";

type RecoveryHumanAttentionPopup = {
  conversationId: number;
  customerName: string;
  phone: string;
  preview: string;
  moduleLabel: string;
  attentionLabel: string;
  kind: RecoveryHumanAttentionKind;
  lastAt: string;
};

type RecoveryHumanAttentionFeedItem = RecoveryHumanAttentionPopup & {
  id: string;
};

type RecoveryNoticeHistoryItem = {
  id: string;
  message: string;
  tone: "info" | "error";
  createdAt: string;
};

function getLatestInboundPreview(messages: RecoveryInteractionMessage[]) {
  const lastInbound = [...messages]
    .reverse()
    .find((message) => String(message.direction || "").trim().toUpperCase() === "INBOUND");
  return String(lastInbound?.body || "").trim();
}

type RecoveryInboxFallbackConversation = {
  id: string;
  status: string;
  updatedAt: string;
  routeTarget?: string;
  routeReason?: string;
  recoveryCustomerId?: string | null;
  recoveryCustomerName?: string | null;
  recoveryOpenAmount?: number | null;
  recoveryCurrentStep?: string | null;
  latestSourceModule?: string | null;
  isBlocked?: boolean;
  blockedAt?: string | null;
  blockedReason?: string | null;
  metadata?: Record<string, unknown> | null;
  customer?: {
    id?: string;
    phone?: string;
    name?: string | null;
  };
  messages?: Array<{
    id?: string;
    direction?: string;
    content?: string;
    createdAt?: string;
    messageType?: string;
    senderType?: string;
    sourceModule?: string | null;
    status?: string;
  }>;
};

function mapInboxConversationDetailToRecoveryDetail(
  row: RecoveryInboxFallbackConversation,
): RecoveryInteractionDetail {
  const status = String(row.status || "").trim().toLowerCase();
  const phone = String(row.customer?.phone || "").trim();
  const customerName = String(
    row.customer?.name || row.recoveryCustomerName || phone || "Cliente",
  ).trim();
  const messages = Array.isArray(row.messages) ? [...row.messages] : [];

  return {
    conversationId: Number(row.id),
    botActive: status === "new",
    humanAssigned: status === "open",
    isBlocked: Boolean(row.isBlocked || status === "blocked"),
    blockedAt: row.blockedAt ?? null,
    blockedReason: row.blockedReason ?? null,
    assignedUserId: null,
    currentFlow:
      String(row.routeTarget || "").trim().toLowerCase() === "recovery"
        ? "inbox_recovery_fallback"
        : "inbox_fallback",
    currentStep: String(row.recoveryCurrentStep || "").trim() || "novo",
    flowResult: status === "closed" ? "manual_closed" : null,
    metadata: row.metadata || {},
    lastInteractionAt: String(row.updatedAt || "").trim() || null,
    customer: {
      id: String(row.recoveryCustomerId || row.customer?.id || row.id || "").trim(),
      name: customerName,
      whatsappNumber: phone,
      conversationWhatsapp: phone,
      openAmount: Number(row.recoveryOpenAmount || 0),
      status: status === "open" || String(row.routeTarget || "").trim().toLowerCase() === "recovery"
        ? "OVERDUE"
        : "UNKNOWN",
    },
    latestPayment: null,
    messages: messages.map((message, index) => ({
      id: Number(message.id || index + 1),
      direction: String(message.direction || "").trim().toUpperCase() || "OUTBOUND",
      messageType: String(message.messageType || "text").trim().toLowerCase(),
      senderType: String(message.senderType || "").trim().toLowerCase() || null,
      body: String(message.content || "").trim(),
      variables: {},
      status: String(message.status || "RECEIVED").trim().toUpperCase(),
      sourceModule: String(message.sourceModule || row.latestSourceModule || "").trim() || null,
      isComplaint: false,
      timestamp: String(message.createdAt || row.updatedAt || new Date().toISOString()).trim(),
    })),
  };
}

function mapInboxConversationsToRecoverySummary(
  rows: RecoveryInboxFallbackConversation[],
  queue: "all" | "closed" | "blocked",
): RecoveryInteractionSummary {
  const conversations = rows
    .filter((row) => String(row.routeTarget || "").trim().toLowerCase() === "recovery")
    .map((row) => {
    const latestMessage = Array.isArray(row.messages) ? row.messages[0] : null;
    const status = String(row.status || "").trim().toLowerCase();
    const phone = String(row.customer?.phone || "").trim();
    const customerName = String(
      row.customer?.name || row.recoveryCustomerName || phone || "Cliente",
    ).trim();
    const updatedAt = String(latestMessage?.createdAt || row.updatedAt || new Date().toISOString()).trim();

    return {
      conversationId: Number(row.id),
      customerId: String(row.recoveryCustomerId || row.customer?.id || row.id || "").trim(),
      customerName,
      customerWhatsapp: phone,
      conversationWhatsapp: phone,
      customerStatus: status === "open" ? "OVERDUE" : "UNKNOWN",
      openAmount: Number(row.recoveryOpenAmount || 0),
      lastContact: "",
      humanQueue: status === "open",
      isClosed: status === "closed",
      isBlocked: Boolean(row.isBlocked || status === "blocked"),
      blockedAt: row.blockedAt ?? null,
      blockedReason: row.blockedReason ?? null,
      botActive: status === "new",
      humanAssigned: status === "open",
      assignedUserId: null,
      currentFlow: "inbox_recovery_fallback",
      currentStep: String(row.recoveryCurrentStep || "").trim(),
      flowResult: status === "closed" ? "manual_closed" : null,
      metadata: row.metadata || {},
      complaintCount: 0,
      lastMessage: String(latestMessage?.content || "").trim(),
      lastDirection: String(latestMessage?.direction || "").trim().toUpperCase(),
      lastSourceModule: String(
        latestMessage?.sourceModule ||
          latestMessage?.senderType ||
          latestMessage?.messageType ||
          row.latestSourceModule ||
          "",
      ).trim(),
      lastAt: updatedAt,
      lastInteractionAt: updatedAt,
      paymentGenerated: false,
      paymentLifecycle: null,
      paymentStatus: null,
      paymentLink: null,
      paymentLinkExpiresAt: null,
    };
  });

  const filtered =
    queue === "blocked"
      ? conversations.filter((item) => item.isBlocked)
      : queue === "closed"
      ? conversations.filter((item) => item.isClosed)
      : conversations.filter((item) => !item.isClosed && !item.isBlocked);

  return {
    queue,
    pendingHumanCount: conversations.filter((item) => item.humanQueue && !item.isClosed).length,
    conversations: filtered,
  };
}

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatRegistrationDate(isoDate?: string) {
  const normalized = String(isoDate || "").trim();
  if (!normalized) return "-";
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("pt-BR");
}

function daysSinceIsoDate(isoDate?: string) {
  const normalized = String(isoDate || "").trim();
  if (!normalized) return 0;
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 0;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = today.getTime() - parsed.getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

function formatDateTime(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) return "-";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}

function mapSenderLabel(senderType: string | null | undefined, direction: string) {
  const sender = String(senderType || "").trim().toLowerCase();
  if (sender === "bot") return "BOT";
  if (sender === "human") return "Humano";
  if (sender === "system") return "Sistema";
  if (sender === "client") return "Cliente";
  return String(direction || "").toUpperCase() === "INBOUND" ? "Cliente" : "BOT";
}

function mapRecoveryMessageTone(message: RecoveryInteractionMessage) {
  const senderType = String(message.senderType || "").trim().toLowerCase();
  const direction = String(message.direction || "").trim().toUpperCase();
  if (senderType === "system") return "system" as const;
  if (senderType === "human") return "human" as const;
  if (direction === "INBOUND" || senderType === "client") return "inbound" as const;
  return "outbound" as const;
}

function mapPaymentStatusLabel(statusRaw: string | null | undefined) {
  const status = String(statusRaw || "").trim().toLowerCase();
  const labels: Record<string, string> = {
    pending: "Aguardando pagamento",
    in_process: "Em processamento",
    approved: "Pago",
    released: "Liberado",
    refunded: "Estornado",
    partially_refunded: "Parcialmente estornado",
    cancelled: "Cancelado",
    failed: "Falhou",
    rejected: "Rejeitado",
    preparing: "Preparando",
  };
  return labels[status] || (status ? status : "-");
}

function getInteractionEventType(message: RecoveryInteractionMessage) {
  const eventType = message.variables?.eventType;
  return String(eventType || "").trim().toLowerCase();
}

function isLowSignalInteractionMessage(message: RecoveryInteractionMessage) {
  const eventType = getInteractionEventType(message);
  return (
    String(message.messageType || "").trim().toLowerCase() === "system_event" &&
    eventType === "template_start"
  );
}

function shouldShowInteractionVariables(message: RecoveryInteractionMessage) {
  const messageType = String(message.messageType || "").trim().toLowerCase();
  return messageType !== "template" && messageType !== "system_event";
}

function isoDateToMaskedDigits(isoDate: string) {
  const normalized = String(isoDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

function formatDateDigitsInput(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDigitsToIsoDate(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length !== 6 && digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = digits.length === 6 ? Number(`20${digits.slice(4, 6)}`) : Number(digits.slice(4, 8));
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (month < 1 || month > 12) return null;
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildRecoveryMessage(customer: RecoveryCustomer, actionId: DrawerActionId) {
  const recipient = customer.clientName || customer.name;
  if (actionId === "send_charge") {
    return `Oi ${recipient}, identificamos ${formatCurrency(customer.openAmount)} em aberto no Recovery. Posso te enviar os detalhes para regularizacao hoje?`;
  }

  if (actionId === "send_pix") {
    return `Oi ${recipient}, podemos acelerar sua regularizacao via Pix. Responda este WhatsApp para receber o link de pagamento.`;
  }

  return `Oi ${recipient}, consigo te oferecer uma proposta de parcelamento para os valores em atraso. Posso te apresentar as opcoes agora?`;
}

function parseTemplateButtonLines(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 3);
}

function extractTemplateVariablesInOrder(text: string) {
  const ordered: string[] = [];
  const regex = /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu;
  let match: RegExpExecArray | null = null;
  while (true) {
    match = regex.exec(String(text || ""));
    if (!match?.[1]) break;
    const normalizedKey = normalizeTemplateVariableKey(String(match[1] || ""));
    if (normalizedKey && !ordered.includes(normalizedKey)) ordered.push(normalizedKey);
  }
  return ordered;
}

function startsWithTemplateVariable(text: string) {
  return /^\s*\{\{\s*[\p{L}\p{N}_]+\s*\}\}/u.test(String(text || ""));
}

function endsWithTemplateVariable(text: string) {
  return /\{\{\s*[\p{L}\p{N}_]+\s*\}\}\s*$/u.test(String(text || ""));
}

function normalizeTemplateVariableKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function extractTemplateVariables(text: string) {
  const matchSet = new Set<string>();
  const regex = /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu;
  let match: RegExpExecArray | null = null;
  while (true) {
    match = regex.exec(String(text || ""));
    if (!match?.[1]) break;
    const normalizedKey = normalizeTemplateVariableKey(String(match[1] || ""));
    if (normalizedKey) matchSet.add(normalizedKey);
  }
  return Array.from(matchSet.values()).sort();
}

function isNumericTemplateVariableKey(value: string) {
  return /^\d+$/.test(String(value || "").trim());
}

function inferTemplateVariableMode(variableKeys: string[]) {
  return variableKeys.some((item) => !isNumericTemplateVariableKey(item)) ? "NAME" : "NUMBER";
}

function defaultTemplateVariableExample(
  keyRaw: string,
  index: number,
  fallbackSamples: Record<string, string>,
) {
  const key = normalizeTemplateVariableKey(keyRaw);
  if (!isNumericTemplateVariableKey(key)) {
    return fallbackSamples[key] || key.replace(/_/g, " ");
  }

  const orderedFallbacks = [
    fallbackSamples.empresa || "Empresa Exemplo",
    fallbackSamples.cliente || "Maria Oliveira",
    fallbackSamples.data_servico || "12/03/2026",
    fallbackSamples.funcionario || "Atendente",
    fallbackSamples.valor_formatado || "R$ 480,00",
    fallbackSamples.quantidade_parcelas || "3",
    fallbackSamples.link_pagamento || "https://pagamentos.hbx.app/exemplo",
  ];
  return orderedFallbacks[index] || `Exemplo ${index + 1}`;
}

function buildComposerVariableExamples(
  variableKeys: string[],
  currentExamples: Record<string, string>,
  fallbackSamples: Record<string, string>,
) {
  const next: Record<string, string> = {};
  variableKeys.forEach((key, index) => {
    const normalizedKey = normalizeTemplateVariableKey(key);
    next[normalizedKey] =
      String(currentExamples?.[normalizedKey] || "").trim() ||
      defaultTemplateVariableExample(normalizedKey, index, fallbackSamples);
  });
  return next;
}

function renderTemplatePreviewText(text: string, samples: Record<string, string>) {
  return String(text || "").replace(/\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu, (_match, key) => {
    const normalizedKey = normalizeTemplateVariableKey(String(key || ""));
    return samples[normalizedKey] || `[${normalizedKey.toUpperCase()}]`;
  });
}

function loadImageElement(file: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Nao foi possivel ler a imagem selecionada."));
    };
    image.src = objectUrl;
  });
}

async function compressTemplateImage(file: File) {
  const image = await loadImageElement(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return file;

  const canvasSize = 1080;
  const safeAreaSize = 500;
  const targetMaxBytes = 500 * 1024;
  const qualities = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46];
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return file;

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const scale = Math.min(safeAreaSize / width, safeAreaSize / height);
  const drawWidth = Math.max(1, Math.round(width * scale));
  const drawHeight = Math.max(1, Math.round(height * scale));
  const offsetX = Math.round((canvasSize - drawWidth) / 2);
  const offsetY = Math.round((canvasSize - drawHeight) / 2);

  let bestBlob: Blob | null = null;
  for (const quality of qualities) {
    context.clearRect(0, 0, canvasSize, canvasSize);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvasSize, canvasSize);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    });
    if (!compressedBlob) continue;
    if (!bestBlob || compressedBlob.size < bestBlob.size) {
      bestBlob = compressedBlob;
    }
    if (compressedBlob.size <= targetMaxBytes) {
      bestBlob = compressedBlob;
      break;
    }
  }
  if (!bestBlob) return file;

  const nextName = String(file.name || "logo")
    .replace(/\.[a-z0-9]+$/i, "")
    .concat(".jpg");
  return new File([bestBlob], nextName, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function metaStatusLabel(statusRaw: string) {
  const normalized = String(statusRaw || "").trim().toUpperCase();
  if (normalized === "APPROVED") return "Aprovado";
  if (normalized === "PENDING") return "Pendente";
  if (normalized === "IN_APPEAL") return "Em analise";
  if (normalized === "REJECTED") return "Reprovado";
  if (normalized === "PAUSED") return "Pausado";
  if (normalized === "DISABLED") return "Desativado";
  return normalized || "Desconhecido";
}

function normalizeHeaderFormat(
  formatRaw: string | null | undefined,
): "NONE" | "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO" | null {
  const normalized = String(formatRaw || "").trim().toUpperCase();
  if (normalized === "NONE") return "NONE";
  if (
    normalized === "TEXT" ||
    normalized === "IMAGE" ||
    normalized === "DOCUMENT" ||
    normalized === "VIDEO"
  ) {
    return normalized;
  }
  return null;
}

function isMediaHeaderFormat(formatRaw: string | null | undefined) {
  const format = normalizeHeaderFormat(formatRaw);
  return format === "IMAGE" || format === "DOCUMENT" || format === "VIDEO";
}

function headerFormatLabel(formatRaw: string | null | undefined) {
  const format = normalizeHeaderFormat(formatRaw);
  if (format === "TEXT") return "Cabecalho texto";
  if (format === "IMAGE") return "Cabecalho imagem";
  if (format === "DOCUMENT") return "Cabecalho documento";
  if (format === "VIDEO") return "Cabecalho video";
  return "Sem cabecalho";
}

function buildRecoveryChartSeries(customers: RecoveryCustomer[], points = 6) {
  const now = new Date();
  const rows: Array<{ key: string; label: string; recovered: number }> = [];
  for (let index = points - 1; index >= 0; index -= 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    const label = monthDate.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    rows.push({ key, label, recovered: 0 });
  }
  const map = new Map(rows.map((item) => [item.key, item]));
  for (const customer of customers) {
    for (const payment of customer.paymentHistory || []) {
      const amount = Number(payment.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const parsed = new Date(`${String(payment.date || "").trim()}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) continue;
      const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
      const point = map.get(key);
      if (!point) continue;
      point.recovered = Number((point.recovered + amount).toFixed(2));
    }
  }
  return rows;
}

type CustomerRow = RecoveryCustomer & {
  risk: ReturnType<typeof calculateRiskScore>;
  daysSinceRegistration: number;
};

type NewDebtorForm = {
  companyName: string;
  clientName: string;
  whatsappNumber: string;
  openAmount: string;
  registrationDate: string;
  registrationDateInput: string;
};

type RecoveryTab = "recovery" | "register" | "payments" | "messages" | "templates" | "bot";

function normalizeRecoveryTab(value: string | null | undefined): RecoveryTab | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "recovery" ||
    normalized === "register" ||
    normalized === "payments" ||
    normalized === "messages" ||
    normalized === "templates" ||
    normalized === "bot"
  ) {
    return normalized;
  }
  return null;
}

type RecoveryImportRow = {
  sourceRow: number;
  name: string;
  clientName: string;
  whatsappNumber: string;
  openAmount: number;
  registrationDate: string;
};

type RecoveryImportIssue = {
  row: number;
  reason: string;
};

type RecoveryCurrentUserPayload = {
  id?: string | number | null;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  isSystemMaster?: boolean;
  company?: {
    id?: number | null;
    name?: string | null;
  } | null;
};

type RecoveryRegisterFilterId =
  | "overdue"
  | "paid"
  | "aged30"
  | "aged60"
  | "risk_high"
  | "automation_on"
  | "automation_off"
  | "all";

const REGISTER_FILTER_OPTIONS: Array<{
  id: RecoveryRegisterFilterId;
  label: string;
}> = [
  { id: "overdue", label: "Em cobranca" },
  { id: "paid", label: "Pagos" },
  { id: "aged30", label: "30+ dias" },
  { id: "aged60", label: "60+ dias" },
  { id: "risk_high", label: "Risco alto" },
  { id: "automation_on", label: "Auto ativa" },
  { id: "automation_off", label: "Auto pausada" },
  { id: "all", label: "Todos" },
];

type RecoveryTemplateComposer = {
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  language: string;
  variableMode: "NAME" | "NUMBER";
  headerFormat: "NONE" | "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO";
  headerText: string;
  headerHandle: string;
  headerMediaUrl: string;
  bodyText: string;
  footerText: string;
  buttonsText: string;
  variableExamples: Record<string, string>;
  activateInHbx: boolean;
  enforceRecoveryVars: boolean;
};

type TemplateWindowId = "composer" | "catalog" | "history" | "preview";

type TemplateWindowResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type TemplateWindowSize = {
  width: number | null;
  height: number | null;
};

const TEMPLATE_WINDOW_IDS: TemplateWindowId[] = [
  "composer",
  "catalog",
  "history",
  "preview",
];

const DEFAULT_TEMPLATE_WINDOW_ORDER: TemplateWindowId[] = [...TEMPLATE_WINDOW_IDS];

const TEMPLATE_WINDOW_LABELS: Record<TemplateWindowId, string> = {
  composer: "Criar template na Meta",
  catalog: "Catalogo PT-BR",
  history: "Historico de aprovacao",
  preview: "Preview ao vivo",
};

const TEMPLATE_WINDOW_DESCRIPTIONS: Record<TemplateWindowId, string> = {
  composer: "Editor e checklist do template.",
  catalog: "Lista de templates ativos e aprovados.",
  history: "Mudancas de status vindas da Meta.",
  preview: "Simulacao do que o cliente recebe.",
};

const RECOVERY_REQUIRED_TEMPLATE_VARIABLES = ["empresa", "cliente", "data_servico"] as const;

const DEFAULT_BOT_VARIABLE_CATALOG: RecoveryBotVariableDefinition[] = [
  {
    key: "cliente",
    label: "Nome do cliente",
    example: "Maria Oliveira",
    description: "Nome principal usado nas mensagens, templates e tratativas.",
    scope: "shared",
    required: true,
  },
  {
    key: "empresa",
    label: "Nome da empresa",
    example: "Colsani Ar Condicionado",
    description: "Tenant atual que dispara o fluxo e aparece no template inicial.",
    scope: "shared",
    required: true,
  },
  {
    key: "funcionario",
    label: "Nome do atendente",
    example: "Leo Colsani",
    description: "Usado quando o texto precisa humanizar o contato manual.",
    scope: "atendimento",
    required: false,
  },
  {
    key: "data_servico",
    label: "Data do servico",
    example: "12/03/2026",
    description: "Data da visita ou ordem de servico vinculada ao debito.",
    scope: "recovery",
    required: true,
  },
  {
    key: "descricao_servico",
    label: "Descricao do servico",
    example: "manutencao preventiva",
    description: "Resumo curto do motivo da cobranca ou da negociacao.",
    scope: "recovery",
    required: true,
  },
  {
    key: "valor_formatado",
    label: "Valor em aberto",
    example: "R$ 480,00",
    description: "Valor final formatado para aparecer no WhatsApp e no painel.",
    scope: "recovery",
    required: true,
  },
  {
    key: "quantidade_parcelas",
    label: "Parcelas legadas",
    example: "3",
    description: "Compatibilidade para templates antigos que ainda citam parcelamento.",
    scope: "recovery",
    required: false,
  },
  {
    key: "valor_parcela_formatado",
    label: "Valor da parcela",
    example: "R$ 160,00",
    description: "Compatibilidade com mensagens legadas de parcelamento.",
    scope: "recovery",
    required: false,
  },
  {
    key: "link_pagamento",
    label: "Link de pagamento",
    example: "https://pagamentos.hbx.app/exemplo",
    description: "URL final de checkout, Pix ou cartao enviada ao cliente.",
    scope: "shared",
    required: true,
  },
];

const DEFAULT_BOT_ACTION_CATALOG: RecoveryBotActionGuide[] = [
  {
    actionId: "view_amount",
    title: "Ver valor pendente",
    description: "Exibe saldo, servico e contexto da cobranca.",
    route: "recovery",
    enabled: true,
  },
  {
    actionId: "choose_installments",
    title: "Pagar no credito",
    description: "Leva o cliente para checkout em cartao com condicoes disponiveis.",
    route: "recovery",
    enabled: true,
  },
  {
    actionId: "pay_full",
    title: "Pagar no Pix",
    description: "Gera pagamento imediato via Pix.",
    route: "recovery",
    enabled: true,
  },
  {
    actionId: "talk_human",
    title: "Falar com atendente",
    description: "Entrega a conversa para a fila humana do Atendimento.",
    route: "atendimento",
    enabled: true,
  },
  {
    actionId: "talk_later",
    title: "Falar depois",
    description: "Abre regras de follow-up para reagendar o contato.",
    route: "recovery",
    enabled: true,
  },
  {
    actionId: "close_topic",
    title: "Encerrar assunto",
    description: "Fecha o assunto atual sem manter a fila manual aberta.",
    route: "shared",
    enabled: true,
  },
  {
    actionId: "followup_today",
    title: "Hoje mais tarde",
    description: "Agenda retorno ainda hoje.",
    route: "recovery",
    enabled: true,
  },
  {
    actionId: "followup_tomorrow",
    title: "Amanha",
    description: "Agenda o retorno para o proximo dia.",
    route: "recovery",
    enabled: true,
  },
  {
    actionId: "followup_week",
    title: "Esta semana",
    description: "Agenda contato futuro ainda dentro da semana.",
    route: "recovery",
    enabled: true,
  },
  {
    actionId: "installment_2",
    title: "Opcao legada 2x",
    description: "Alias legado preservado para cargas antigas.",
    route: "recovery",
    enabled: false,
  },
  {
    actionId: "installment_3",
    title: "Opcao legada 3x",
    description: "Alias legado preservado para cargas antigas.",
    route: "recovery",
    enabled: false,
  },
  {
    actionId: "installment_4",
    title: "Opcao legada 4x",
    description: "Alias legado preservado para cargas antigas.",
    route: "recovery",
    enabled: false,
  },
  {
    actionId: "installment_5",
    title: "Opcao legada 5x",
    description: "Alias legado preservado para cargas antigas.",
    route: "recovery",
    enabled: false,
  },
  {
    actionId: "generate_installment_link",
    title: "Gerar link no credito",
    description: "Confirma o checkout de cartao sem prender uma parcela fixa.",
    route: "recovery",
    enabled: true,
  },
  {
    actionId: "paid_claim",
    title: "Ja paguei",
    description: "Encaminha prova de pagamento ou contestacao para a equipe.",
    route: "atendimento",
    enabled: true,
  },
];

const DEFAULT_BOT_CONFIG: RecoveryBotConfig = {
  variableCatalog: DEFAULT_BOT_VARIABLE_CATALOG,
  actionCatalog: DEFAULT_BOT_ACTION_CATALOG,
  routingRules: {
    preferRecoveryForDebtors: true,
    preferRecoveryForNegotiations: true,
    preferInboxForManualQueue: true,
  },
  rootFooter: "Recovery",
  startTemplates: [],
  mainMenuPrompt: "Perfeito, {{cliente}}. Escolha abaixo como deseja continuar:",
  mainMenuButtons: [
    makeRecoveryButton("main_menu", "view_amount", "Ver valor pendente", 0),
    makeRecoveryButton("main_menu", "choose_installments", "Pagar no credito", 1),
    makeRecoveryButton("main_menu", "pay_full", "Pagar no Pix", 2),
    makeRecoveryButton("main_menu", "talk_human", "Falar com atendente", 3),
  ],
  declineMenuPrompt:
    "Tudo bem. Deseja que nossa equipe entre em contato em outro momento ou prefere encerrar por aqui?",
  declineMenuButtons: [
    makeRecoveryButton("decline_menu", "talk_later", "Falar depois", 0),
    makeRecoveryButton("decline_menu", "close_topic", "Encerrar assunto", 1),
    makeRecoveryButton("decline_menu", "talk_human", "Falar com atendente", 2),
  ],
  followupPrompt: "Qual periodo prefere?",
  followupButtons: [
    makeRecoveryButton("followup_menu", "followup_today", "Hoje mais tarde", 0),
    makeRecoveryButton("followup_menu", "followup_tomorrow", "Amanha", 1),
    makeRecoveryButton("followup_menu", "followup_week", "Esta semana", 2),
  ],
  valueMessageTemplate:
    "Seu valor pendente atual e de {{valor_formatado}} referente ao servico de {{descricao_servico}} realizado em {{data_servico}}.",
  valueButtons: [
    makeRecoveryButton("value_menu", "pay_full", "Pagar no Pix", 0),
    makeRecoveryButton("value_menu", "choose_installments", "Pagar no credito", 1),
    makeRecoveryButton("value_menu", "talk_human", "Falar com atendente", 2),
  ],
  installmentsPrompt: "Perfeito. Vou gerar seu link de pagamento no cartao de credito.",
  installmentButtons: [
    makeRecoveryButton("installment_menu", "choose_installments", "Gerar link no credito", 0),
    makeRecoveryButton("installment_menu", "talk_human", "Falar com atendente", 1),
  ],
  installmentConfirmTemplate:
    "Posso gerar agora seu link de pagamento no cartao de credito.",
  installmentConfirmButtons: [
    makeRecoveryButton("installment_confirm", "generate_installment_link", "Gerar link no credito", 0),
    makeRecoveryButton("installment_confirm", "choose_installments", "Gerar novo link no credito", 1),
    makeRecoveryButton("installment_confirm", "talk_human", "Falar com atendente", 2),
  ],
  cashLinkMessageTemplate:
    "Pronto, {{cliente}}. Aqui esta seu link de pagamento:\n{{link_pagamento}}\n\nAssim que o pagamento for confirmado, avisaremos automaticamente.",
  installmentLinkMessageTemplate:
    "Perfeito, {{cliente}}. Aqui esta seu link de pagamento no cartao de credito:\n{{link_pagamento}}\n\nO checkout vai mostrar as condicoes disponiveis direto no pagamento.",
  postLinkPrompt: "Precisando de algo mais?",
  postLinkButtons: [
    makeRecoveryButton("post_link_menu", "paid_claim", "Ja paguei", 0),
    makeRecoveryButton("post_link_menu", "choose_installments", "Gerar link no credito", 1),
    makeRecoveryButton("post_link_menu", "talk_human", "Falar com atendente", 2),
  ],
  closeTopicMessage: "Entendido. Vamos encerrar esse assunto por agora. Se precisar, estamos por aqui.",
  paidClaimMessage: "Obrigado pelo aviso. Vou encaminhar para validacao humana do pagamento.",
  humanAckMessage: "Certo, vou encaminhar sua conversa para um atendente.",

  // Legacy mirrors
  initialTemplateName: "",
  initialTemplateLanguage: "pt_BR",
  rootPrompt: "Perfeito, {{cliente}}. Escolha abaixo como deseja continuar:",
  optionPixLabel: "Ver valor pendente",
  optionCardLabel: "Pagar no credito",
  optionAgentLabel: "Falar com atendente",
  topicsPrompt: "",
  topicsButtonLabel: "",
  topics: [],
};

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

const DEFAULT_RECOVERY_LAYOUT_CONFIG: RecoveryLayoutConfig = {
  templates: {
    historyPosition: "after",
    workspaceMode: "row",
    workspaceLeadPane: "composer",
    windowOrder: DEFAULT_TEMPLATE_WINDOW_ORDER,
    workspacePrimaryPercent: 48,
    catalogHeight: 640,
    composerHeight: 760,
    composerMode: "row",
    composerPreviewPercent: 46,
  },
};

const DEFAULT_TEMPLATE_COMPOSER: RecoveryTemplateComposer = {
  name: "",
  category: "UTILITY",
  language: "pt_BR",
  variableMode: "NAME",
  headerFormat: "NONE",
  headerText: "",
  headerHandle: "",
  headerMediaUrl: "",
  bodyText:
    "Olá, tudo bem? Aqui é da {{empresa}}.\nFalo com {{cliente}}?\nTemos um assunto financeiro pendente referente ao serviço realizado em {{data_servico}}.\nPodemos conversar sobre opções de pagamento?",
  footerText: "",
  buttonsText: "Sim\nNão, obrigado",
  variableExamples: {},
  activateInHbx: true,
  enforceRecoveryVars: false,
};

const DEFAULT_TEMPLATE_WINDOW_SIZES: Record<TemplateWindowId, TemplateWindowSize> = {
  composer: { width: null, height: null },
  catalog: { width: null, height: null },
  history: { width: null, height: null },
  preview: { width: null, height: null },
};

function clampLayoutPercent(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTemplateWindowOrder(value: unknown): TemplateWindowId[] {
  const incoming = Array.isArray(value) ? value : [];
  const seen = new Set<TemplateWindowId>();
  const normalized: TemplateWindowId[] = [];

  for (const entry of incoming) {
    const id = String(entry || "").trim().toLowerCase() as TemplateWindowId;
    if (!TEMPLATE_WINDOW_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  for (const id of TEMPLATE_WINDOW_IDS) {
    if (!seen.has(id)) normalized.push(id);
  }

  return normalized;
}

function normalizeTemplateDeckWindowOrder(value: unknown): TemplateWindowId[] {
  return normalizeTemplateWindowOrder(value).filter((item) => item !== "preview");
}

function normalizeRecoveryLayoutConfig(
  payload: RecoveryLayoutConfig | null | undefined,
): RecoveryLayoutConfig {
  const templates = payload?.templates;
  return {
    templates: {
      historyPosition: templates?.historyPosition === "before" ? "before" : "after",
      workspaceMode: templates?.workspaceMode === "column" ? "column" : "row",
      workspaceLeadPane: templates?.workspaceLeadPane === "catalog" ? "catalog" : "composer",
      windowOrder: normalizeTemplateWindowOrder(templates?.windowOrder),
      workspacePrimaryPercent: clampLayoutPercent(
        Number(
          templates?.workspacePrimaryPercent ||
            DEFAULT_RECOVERY_LAYOUT_CONFIG.templates.workspacePrimaryPercent,
        ),
        40,
        72,
      ),
      catalogHeight: clampLayoutPercent(
        Number(templates?.catalogHeight || DEFAULT_RECOVERY_LAYOUT_CONFIG.templates.catalogHeight),
        360,
        1400,
      ),
      composerHeight: clampLayoutPercent(
        Number(templates?.composerHeight || DEFAULT_RECOVERY_LAYOUT_CONFIG.templates.composerHeight),
        480,
        1600,
      ),
      composerMode: templates?.composerMode === "column" ? "column" : "row",
      composerPreviewPercent: clampLayoutPercent(
        Number(
          templates?.composerPreviewPercent ||
            DEFAULT_RECOVERY_LAYOUT_CONFIG.templates.composerPreviewPercent,
        ),
        34,
        62,
      ),
    },
  };
}

function buildRecoveryLayoutStorageKey(userId: string | number | null | undefined) {
  const normalized = String(userId ?? "").trim();
  return normalized ? `hbx-recovery:layout:${normalized}` : "hbx-recovery:layout";
}

function readRecoveryLayoutFromStorage(storageKey: string): RecoveryLayoutConfig {
  if (typeof window === "undefined") return DEFAULT_RECOVERY_LAYOUT_CONFIG;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_RECOVERY_LAYOUT_CONFIG;
    return normalizeRecoveryLayoutConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_RECOVERY_LAYOUT_CONFIG;
  }
}

function writeRecoveryLayoutToStorage(storageKey: string, config: RecoveryLayoutConfig) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizeRecoveryLayoutConfig(config)));
  } catch {
    // ignore storage errors
  }
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

function getTemplateViewModel(template: RecoveryMetaTemplateItem) {
  const normalized = template.normalized;
  return {
    headerFormat: normalizeHeaderFormat(normalized?.header?.format || template.headerFormat) || "NONE",
    headerText: normalized?.header?.text ?? template.headerText ?? "",
    headerHandle: normalized?.header?.exampleHandle ?? template.headerHandle ?? "",
    headerMediaUrl: normalized?.header?.mediaUrl ?? template.headerMediaUrl ?? "",
    bodyText: normalized?.body?.text ?? template.bodyText ?? "",
    footerText: normalized?.footer?.text ?? template.footerText ?? "",
    variableOrder: Array.isArray(normalized?.body?.variableOrder)
      ? normalized.body.variableOrder
      : Array.isArray(template.variableKeys)
        ? template.variableKeys
        : [],
    variableExamples:
      normalized?.body?.variableExamples && typeof normalized.body.variableExamples === "object"
        ? normalized.body.variableExamples
        : {},
    buttons: Array.isArray(normalized?.buttons) && normalized.buttons.length
      ? normalized.buttons
      : (template.buttonLabels || []).map((text) => ({
          type: "QUICK_REPLY",
          text,
          url: null,
          phoneNumber: null,
        })),
  };
}

type BotButtonSectionKey =
  | "mainMenuButtons"
  | "declineMenuButtons"
  | "followupButtons"
  | "valueButtons"
  | "installmentButtons"
  | "installmentConfirmButtons"
  | "postLinkButtons";

const BOT_ACTION_LABELS: Record<RecoveryBotActionId, string> = {
  view_amount: "Ver valor pendente",
  choose_installments: "Pagar no credito",
  pay_full: "Pagar no Pix",
  talk_human: "Falar com atendente",
  talk_later: "Falar depois",
  close_topic: "Encerrar assunto",
  followup_today: "Follow-up hoje mais tarde",
  followup_tomorrow: "Follow-up amanha",
  followup_week: "Follow-up esta semana",
  installment_2: "Opcao legada 2x",
  installment_3: "Opcao legada 3x",
  installment_4: "Opcao legada 4x",
  installment_5: "Opcao legada 5x",
  generate_installment_link: "Gerar link no credito",
  paid_claim: "Ja paguei",
};

const BOT_ACTION_OPTIONS: Array<{ value: RecoveryBotActionId; label: string }> = (
  Object.keys(BOT_ACTION_LABELS) as RecoveryBotActionId[]
).map((value) => ({ value, label: BOT_ACTION_LABELS[value] }));

function getBotActionLabel(actionId: string) {
  return BOT_ACTION_LABELS[actionId as RecoveryBotActionId] || actionId;
}

function normalizeCustomActionId(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 48);
}

function normalizeRecoveryButtonId(value: string, fallback: string) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_:-]/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function buildRecoveryButtonId(sectionKey: string, actionId: string, index: number) {
  return normalizeRecoveryButtonId(
    `${sectionKey}_${actionId || "action"}_${index + 1}`,
    `${sectionKey}_${index + 1}`,
  );
}

function resolveRecoveryButtonNextNodeId(actionIdRaw: string | null | undefined) {
  const actionId = String(actionIdRaw || "").trim().toLowerCase();
  switch (actionId) {
    case "view_amount":
      return "valueMessageTemplate";
    case "choose_installments":
      return "installmentsPrompt";
    case "pay_full":
      return "cashLinkMessageTemplate";
    case "talk_human":
      return "humanAckMessage";
    case "talk_later":
    case "followup_today":
    case "followup_tomorrow":
    case "followup_week":
      return "followupPrompt";
    case "installment_2":
    case "installment_3":
    case "installment_4":
    case "installment_5":
      return "installmentConfirmTemplate";
    case "generate_installment_link":
      return "installmentLinkMessageTemplate";
    case "paid_claim":
      return "paidClaimMessage";
    case "close_topic":
      return "closeTopicMessage";
    default:
      return "postLinkPrompt";
  }
}

function normalizeRecoveryNextNodeId(value: string | null | undefined, actionId: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_:-]/g, "")
    .slice(0, 80);
  return normalized || resolveRecoveryButtonNextNodeId(actionId);
}

function makeRecoveryButton(
  sectionKey: string,
  actionId: RecoveryBotActionId | string,
  title: string,
  index: number,
): RecoveryBotButton {
  return {
    buttonId: buildRecoveryButtonId(sectionKey, String(actionId || ""), index),
    actionId,
    title,
    nextNodeId: resolveRecoveryButtonNextNodeId(String(actionId || "")),
  };
}

function ensureBotConfigShape(config: RecoveryBotConfig | null | undefined): RecoveryBotConfig {
  const merged: RecoveryBotConfig = {
    ...DEFAULT_BOT_CONFIG,
    ...(config || {}),
  };
  const templates = Array.isArray(merged.startTemplates)
    ? merged.startTemplates.filter((item) => String(item?.name || "").trim())
    : [];
  if (!templates.length && merged.initialTemplateName) {
    templates.push({
      id: "template_default",
      name: merged.initialTemplateName,
      language: merged.initialTemplateLanguage || "pt_BR",
      active: true,
    });
  }
  if (!templates.length) {
    templates.push({ id: "template_default", name: "", language: "pt_BR", active: true });
  }
  let activeIndex = templates.findIndex((item) => item.active);
  if (activeIndex < 0) activeIndex = 0;
  merged.startTemplates = templates.map((item, index) => ({ ...item, active: index === activeIndex }));

  const syncButtons = (section: BotButtonSectionKey, fallback: RecoveryBotButton[]) => {
    const hasExplicitButtons = Array.isArray(merged[section]);
    const source = hasExplicitButtons ? (merged[section] as RecoveryBotButton[]) : fallback;
    const seen = new Set<string>();
    merged[section] = source
      .map((button, index) => {
        const actionId = String(button.actionId || "").trim();
        const title = String(button.title || "").trim() || getBotActionLabel(actionId);
        const buttonId = normalizeRecoveryButtonId(
          String(button.buttonId || ""),
          buildRecoveryButtonId(section, actionId, index),
        );
        if (!actionId || !title || seen.has(buttonId)) return null;
        seen.add(buttonId);
        return {
          buttonId,
          actionId,
          title,
          nextNodeId: normalizeRecoveryNextNodeId(String(button.nextNodeId || ""), actionId),
        };
      })
      .filter(Boolean) as RecoveryBotConfig[BotButtonSectionKey];
  };

  syncButtons("mainMenuButtons", DEFAULT_BOT_CONFIG.mainMenuButtons);
  syncButtons("declineMenuButtons", DEFAULT_BOT_CONFIG.declineMenuButtons);
  syncButtons("followupButtons", DEFAULT_BOT_CONFIG.followupButtons);
  syncButtons("valueButtons", DEFAULT_BOT_CONFIG.valueButtons);
  syncButtons("installmentButtons", DEFAULT_BOT_CONFIG.installmentButtons);
  syncButtons("installmentConfirmButtons", DEFAULT_BOT_CONFIG.installmentConfirmButtons);
  syncButtons("postLinkButtons", DEFAULT_BOT_CONFIG.postLinkButtons);

  const variableCatalog = Array.isArray(merged.variableCatalog) ? merged.variableCatalog : [];
  const variables = new Map<string, RecoveryBotVariableDefinition>();
  for (const item of DEFAULT_BOT_VARIABLE_CATALOG) {
    variables.set(item.key, { ...item });
  }
  for (const item of variableCatalog) {
    const key = String(item?.key || "").trim();
    if (!key) continue;
    variables.set(key, {
      key,
      label: String(item.label || variables.get(key)?.label || key).trim(),
      example: String(item.example || variables.get(key)?.example || "").trim(),
      description: String(item.description || variables.get(key)?.description || "").trim(),
      scope: (["shared", "recovery", "atendimento"] as const).includes(item.scope)
        ? item.scope
        : (variables.get(key)?.scope || "shared"),
      required: item.required ?? variables.get(key)?.required ?? false,
    });
  }
  merged.variableCatalog = Array.from(variables.values());

  const actionCatalog = Array.isArray(merged.actionCatalog) ? merged.actionCatalog : [];
  const actions = new Map<string, RecoveryBotActionGuide>();
  for (const item of DEFAULT_BOT_ACTION_CATALOG) {
    actions.set(String(item.actionId), { ...item });
  }
  for (const item of actionCatalog) {
    if (!item?.actionId) continue;
    const actionKey = String(item.actionId);
    actions.set(actionKey, {
      actionId: item.actionId,
      title: String(item.title || actions.get(actionKey)?.title || getBotActionLabel(actionKey)).trim(),
      description: String(item.description || actions.get(actionKey)?.description || "").trim(),
      route: (["shared", "recovery", "atendimento"] as const).includes(item.route)
        ? item.route
        : (actions.get(actionKey)?.route || "shared"),
      enabled: item.enabled ?? actions.get(actionKey)?.enabled ?? true,
      responseMessage: String(item.responseMessage || actions.get(actionKey)?.responseMessage || "").trim(),
      custom: item.custom ?? actions.get(actionKey)?.custom ?? false,
    });
  }
  merged.actionCatalog = Array.from(actions.values());
  merged.routingRules = {
    ...DEFAULT_BOT_CONFIG.routingRules,
    ...(merged.routingRules || {}),
  };

  const activeTemplate = merged.startTemplates.find((item) => item.active) || merged.startTemplates[0];
  merged.initialTemplateName = activeTemplate?.name || "";
  merged.initialTemplateLanguage = activeTemplate?.language || "pt_BR";
  return merged;
}

function buildBotEditorStartTemplates(metaPayload: RecoveryMetaTemplatesPayload) {
  return (metaPayload.templates || [])
    .filter((item) => item.hbxActive && item.metaApproved)
    .map((item) => ({
      id: `${item.name}__${item.language}`,
      name: item.name,
      language: item.language,
      active: false,
    }));
}

function metaTemplateUsesOnlyQuickReplies(template: RecoveryMetaTemplateItem) {
  const view = getTemplateViewModel(template);
  if (!view.buttons.length) return false;
  let buttonCount = 0;
  for (const button of view.buttons) {
    const type = String(button.type || "").trim().toUpperCase();
    if (type !== "QUICK_REPLY") return false;
    buttonCount += 1;
  }

  return buttonCount > 0 && buttonCount <= 3;
}

function getRecoveryStartTemplateIssues(template: RecoveryMetaTemplateItem | null | undefined) {
  if (!template) return ["Template inicial nao encontrado no catalogo Meta."];

  const view = getTemplateViewModel(template);
  const issues: string[] = [];
  if (!template.hbxActive) issues.push("ative o template no HBX");
  if (!template.metaApproved) issues.push("aguarde o status APPROVED na Meta");
  if (String(template.language || "").trim().toLowerCase() !== "pt_br") {
    issues.push("use a variante pt_BR");
  }
  if (
    isMediaHeaderFormat(view.headerFormat) &&
    !String(view.headerMediaUrl || "").trim()
  ) {
    issues.push("salve a URL publica do cabecalho de midia");
  }
  if (!metaTemplateUsesOnlyQuickReplies(template)) {
    issues.push("mantenha de 1 a 3 botoes do tipo resposta rapida");
  }
  return issues;
}

function isRecoveryStartTemplateCompatible(template: RecoveryMetaTemplateItem | null | undefined) {
  return getRecoveryStartTemplateIssues(template).length === 0;
}

function moveTemplateWindowOrder(
  currentOrder: TemplateWindowId[],
  id: TemplateWindowId,
  direction: "left" | "right",
) {
  const normalized = normalizeTemplateDeckWindowOrder(currentOrder);
  const currentIndex = normalized.indexOf(id);
  if (currentIndex < 0) return normalized;
  const targetIndex =
    direction === "left"
      ? Math.max(0, currentIndex - 1)
      : Math.min(normalized.length - 1, currentIndex + 1);
  if (targetIndex === currentIndex) return normalized;
  const next = [...normalized];
  const [entry] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, entry);
  return next;
}

function swapTemplateWindowOrder(
  currentOrder: TemplateWindowId[],
  sourceId: TemplateWindowId,
  targetId: TemplateWindowId,
) {
  const normalized = normalizeTemplateDeckWindowOrder(currentOrder);
  const sourceIndex = normalized.indexOf(sourceId);
  const targetIndex = normalized.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return normalized;
  const next = [...normalized];
  [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
  return next;
}

function syncBotConfigWithMetaTemplates(
  configInput: RecoveryBotConfig,
  metaPayload: RecoveryMetaTemplatesPayload,
) {
  const config = ensureBotConfigShape(configInput);
  const availableTemplates = buildBotEditorStartTemplates(metaPayload);
  if (!availableTemplates.length) {
    return ensureBotConfigShape({
      ...config,
      startTemplates: [{ id: "template_default", name: "", language: "pt_BR", active: true }],
    });
  }

  const currentActive =
    config.startTemplates.find((item) => item.active) ||
    config.startTemplates.find((item) => item.name === config.initialTemplateName) ||
    null;
  const currentKey = currentActive
    ? `${String(currentActive.name || "").trim().toLowerCase()}::${String(
        currentActive.language || "pt_BR",
      )
        .trim()
        .toLowerCase()}`
    : "";

  let activeIndex = availableTemplates.findIndex(
    (item) =>
      `${String(item.name || "").trim().toLowerCase()}::${String(item.language || "pt_BR")
        .trim()
        .toLowerCase()}` === currentKey,
  );
  if (activeIndex < 0) activeIndex = 0;

  return ensureBotConfigShape({
    ...config,
    startTemplates: availableTemplates.map((item, index) => ({
      ...item,
      active: index === activeIndex,
    })),
  });
}

export default function HbxRecoveryClientPage() {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = useMemo(
    () => normalizeRecoveryTab(searchParams?.get("tab")) || "messages",
    [searchParams],
  );
  const [drawerCustomerId, setDrawerCustomerId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [botConfig, setBotConfig] = useState<RecoveryBotConfig>(ensureBotConfigShape(DEFAULT_BOT_CONFIG));
  const [loadingBotConfig, setLoadingBotConfig] = useState(true);
  const [savingBotConfig, setSavingBotConfig] = useState(false);
  const [flowStages, setFlowStages] = useState<RecoveryFlowStage[]>([]);
  const [loadingFlowStages, setLoadingFlowStages] = useState(false);
  const [movingFlowStageId, setMovingFlowStageId] = useState<string | null>(null);
  const [metaTemplates, setMetaTemplates] = useState<RecoveryMetaTemplatesPayload>(
    DEFAULT_META_TEMPLATES_PAYLOAD,
  );
  const [loadingMetaTemplates, setLoadingMetaTemplates] = useState(true);
  const [metaTemplateBusy, setMetaTemplateBusy] = useState<string | null>(null);
  const [templateComposer, setTemplateComposer] = useState<RecoveryTemplateComposer>(
    DEFAULT_TEMPLATE_COMPOSER,
  );
  const [templateComposerError, setTemplateComposerError] = useState<string | null>(null);
  const [templateComposerPreviewVisible, setTemplateComposerPreviewVisible] = useState(false);
  const [templatePreviewRendered, setTemplatePreviewRendered] = useState(false);
  const [templatePreviewTransitionStage, setTemplatePreviewTransitionStage] = useState<
    "idle" | "exit" | "enter"
  >("idle");
  const [templateHeaderDropActive, setTemplateHeaderDropActive] = useState(false);
  const [recoveryLayout, setRecoveryLayout] = useState<RecoveryLayoutConfig>(
    DEFAULT_RECOVERY_LAYOUT_CONFIG,
  );
  const [recoveryLayoutDraft, setRecoveryLayoutDraft] = useState<RecoveryLayoutConfig>(
    DEFAULT_RECOVERY_LAYOUT_CONFIG,
  );
  const [recoveryLayoutStorageKey, setRecoveryLayoutStorageKey] = useState("hbx-recovery:layout");
  const [savingRecoveryLayout, setSavingRecoveryLayout] = useState(false);
  const [drawerBusyAction, setDrawerBusyAction] = useState<DrawerActionId | null>(null);
  const [activeTab, setActiveTab] = useState<RecoveryTab>(requestedTab);
  const [renderedTab, setRenderedTab] = useState<RecoveryTab>(requestedTab);
  const [tabTransitionStage, setTabTransitionStage] = useState<"idle" | "exit" | "enter">("idle");
  const [currentUserProfile, setCurrentUserProfile] = useState<RecoveryCurrentUserPayload | null>(
    null,
  );
  const [paymentMonth, setPaymentMonth] = useState(currentMonthKey());
  const [paymentFilter, setPaymentFilter] = useState<RecoveryPaymentLifecycle | "all">("in_progress");
  const [loadingPaymentHistory, setLoadingPaymentHistory] = useState(false);
  const [refundingPaymentId, setRefundingPaymentId] = useState<string | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<RecoveryPaymentHistorySummary>({
    month: currentMonthKey(),
    monthLabel: "",
    lifecycleFilter: "in_progress",
    counters: { paid: 0, in_progress: 0, finalized: 0, cancelled: 0 },
    totals: {
      totalApprovedAmount: 0,
      totalCommissionAmount: 0,
      totalApprovedCount: 0,
      pendingCount: 0,
    },
    billing: { pendingAmount: 0, grossAmount: 0, commissionAmount: 0, netAmount: 0 },
    records: [],
  });
  const [interactionsQueue, setInteractionsQueue] = useState<"all" | "closed" | "blocked">("all");
  const [loadingInteractions, setLoadingInteractions] = useState(false);
  const [refreshingInteractions, setRefreshingInteractions] = useState(false);
  const [loadingInteractionDetailId, setLoadingInteractionDetailId] = useState<number | null>(null);
  const [interactionSummary, setInteractionSummary] = useState<RecoveryInteractionSummary>({
    queue: "all",
    pendingHumanCount: 0,
    conversations: [],
  });
  const [interactionDetail, setInteractionDetail] = useState<RecoveryInteractionDetail | null>(null);
  const [interactionsError, setInteractionsError] = useState<string | null>(null);
  const [interactionDetailError, setInteractionDetailError] = useState<string | null>(null);
  const [lastInteractionsSyncAt, setLastInteractionsSyncAt] = useState<string | null>(null);
  const [interactionActionBusy, setInteractionActionBusy] = useState<string | null>(null);
  const [interactionNoteDraft, setInteractionNoteDraft] = useState("");
  const [interactionReplyDraft, setInteractionReplyDraft] = useState("");
  const [showSystemMessages, setShowSystemMessages] = useState(false);
  const [humanAttentionPopup, setHumanAttentionPopup] =
    useState<RecoveryHumanAttentionPopup | null>(null);
  const [humanAttentionFeed, setHumanAttentionFeed] = useState<RecoveryHumanAttentionFeedItem[]>([]);
  const interactionDetailRef = useRef<RecoveryInteractionDetail | null>(null);
  const displayedInteractionConversations = useMemo(() => {
    if (interactionsQueue === "closed") {
      return interactionSummary.conversations.filter((conversation) => conversation.isClosed);
    }
    if (interactionsQueue === "blocked") {
      return interactionSummary.conversations.filter((conversation) => conversation.isBlocked);
    }
    return interactionSummary.conversations.filter(
      (conversation) => !conversation.isClosed && !conversation.isBlocked,
    );
  }, [interactionSummary.conversations, interactionsQueue]);
  const [notice, setNotice] = useState<string | null>(
    "Carteira carregada com empresas cadastradas no Recovery. O envio de WhatsApp usa o motor oficial por empresa.",
  );
  const [noticeHistory, setNoticeHistory] = useState<RecoveryNoticeHistoryItem[]>([]);
  const [noticeRendered, setNoticeRendered] = useState(Boolean(notice));
  const [noticeTransitionStage, setNoticeTransitionStage] = useState<"idle" | "enter" | "exit">(
    notice ? "enter" : "idle",
  );
  const [noticeCloseReady, setNoticeCloseReady] = useState(true);
  const [debtorFormError, setDebtorFormError] = useState<string | null>(null);
  const [debtorFormBusy, setDebtorFormBusy] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importPreviewRows, setImportPreviewRows] = useState<RecoveryImportRow[]>([]);
  const [importPreviewIssues, setImportPreviewIssues] = useState<RecoveryImportIssue[]>([]);
  const [importPreviewError, setImportPreviewError] = useState<string | null>(null);
  const [importingRows, setImportingRows] = useState(false);
  const [creatingFlowStage, setCreatingFlowStage] = useState(false);
  const [savingFlowStageId, setSavingFlowStageId] = useState<string | null>(null);
  const [deletingFlowStageId, setDeletingFlowStageId] = useState<string | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [customerRegisterFilter, setCustomerRegisterFilter] =
    useState<RecoveryRegisterFilterId>("overdue");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [customerAutomationBusyId, setCustomerAutomationBusyId] = useState<string | null>(null);
  const [customerAutomationBatchBusy, setCustomerAutomationBatchBusy] = useState<
    "enable" | "disable" | null
  >(null);
  const [newDebtor, setNewDebtor] = useState<NewDebtorForm>({
    companyName: "",
    clientName: "",
    whatsappNumber: "",
    openAmount: "",
    registrationDate: todayIsoDate(),
    registrationDateInput: isoDateToMaskedDigits(todayIsoDate()),
  });

  useEffect(() => {
    interactionDetailRef.current = interactionDetail;
  }, [interactionDetail]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const summaryParts = [
      `Recovery na aba ${activeTab}`,
      interactionDetail?.customer?.name
        ? `cliente em foco ${interactionDetail.customer.name}`
        : drawerCustomerId
          ? `drawer aberto para ${drawerCustomerId}`
          : "sem cliente em foco",
    ];
    if (interactionDetail?.conversationId) {
      summaryParts.push(`conversa ${interactionDetail.conversationId}`);
    }
    if (selectedCustomerIds.length) {
      summaryParts.push(`${selectedCustomerIds.length} cliente(s) selecionado(s)`);
    }

    window.dispatchEvent(
      new CustomEvent("hbx-tech-assistant:page-context", {
        detail: {
          moduleKey: "hbx_recovery",
          route: "/hbx-recovery",
          summary: summaryParts.join(", "),
          tags: [
            activeTab,
            drawerOpen ? "drawer_aberto" : "drawer_fechado",
            interactionDetail?.customer?.status || "sem_status",
            selectedCustomerIds.length ? "com_selecao" : "sem_selecao",
          ],
          details: {
            activeTab,
            renderedTab,
            drawerOpen,
            drawerCustomerId,
            selectedCustomerCount: selectedCustomerIds.length,
            interactionConversationId: interactionDetail?.conversationId || null,
            interactionCustomerId: interactionDetail?.customer?.id || null,
            interactionCustomerName: interactionDetail?.customer?.name || null,
            interactionStatus: interactionDetail?.customer?.status || null,
            interactionRouteTarget: interactionDetail?.currentFlow || null,
            loadingBotConfig,
            savingBotConfig,
            loadingMetaTemplates,
            metaTemplateBusy,
            loadingInteractions,
            refreshingInteractions,
            interactionActionBusy,
            loadingCustomers,
            loadingPaymentHistory,
            customerAutomationBusyId,
            customerAutomationBatchBusy,
          },
        },
      }),
    );
  }, [
    activeTab,
    customerAutomationBatchBusy,
    customerAutomationBusyId,
    drawerCustomerId,
    drawerOpen,
    interactionActionBusy,
    interactionDetail?.conversationId,
    interactionDetail?.currentFlow,
    interactionDetail?.customer?.id,
    interactionDetail?.customer?.name,
    interactionDetail?.customer?.status,
    loadingBotConfig,
    loadingCustomers,
    loadingInteractions,
    loadingMetaTemplates,
    loadingPaymentHistory,
    metaTemplateBusy,
    refreshingInteractions,
    renderedTab,
    savingBotConfig,
    selectedCustomerIds.length,
  ]);
  const [customerSource, setCustomerSource] = useState<RecoveryCustomer[]>([]);
  const closeTimerRef = useRef<number | null>(null);
  const customerRefreshTimerRef = useRef<number | null>(null);
  const tabTransitionTimerRef = useRef<number | null>(null);
  const templatePreviewTransitionTimerRef = useRef<number | null>(null);
  const noticeTransitionTimerRef = useRef<number | null>(null);
  const noticeAutoDismissTimerRef = useRef<number | null>(null);
  const noticeCloseLockTimerRef = useRef<number | null>(null);
  const interactionLastSeenRef = useRef<Map<number, string>>(new Map());
  const interactionHumanQueueRef = useRef<Map<number, boolean>>(new Map());
  const interactionInitialLoadDoneRef = useRef(false);
  const interactionDetailLastInboundRef = useRef<Map<number, string>>(new Map());
  const dismissedHumanAttentionRef = useRef<Map<number, string>>(new Map());
  const humanAttentionRequestRef = useRef(0);
  const workspaceCanvasRef = useRef<HTMLDivElement | null>(null);
  const composerCanvasRef = useRef<HTMLDivElement | null>(null);
  const templatesWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const templateComposerLayoutRef = useRef<HTMLDivElement | null>(null);
  const templateCatalogListRef = useRef<HTMLDivElement | null>(null);
  const templateComposerWindowRef = useRef<HTMLElement | null>(null);
  const templateCatalogWindowRef = useRef<HTMLElement | null>(null);
  const templateHistoryWindowRef = useRef<HTMLElement | null>(null);
  const templatePreviewWindowRef = useRef<HTMLElement | null>(null);
  const layoutResizeSessionRef = useRef<{
    target: "workspace" | "composer" | "catalog" | "composerCard";
    orientation: "row" | "column";
    rect: { left: number; top: number; width: number; height: number };
  } | null>(null);
  const templateWindowResizeSessionRef = useRef<{
    id: TemplateWindowId;
    direction: TemplateWindowResizeDirection;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const [activeLayoutResizeAxis, setActiveLayoutResizeAxis] = useState<"col" | "row" | null>(null);
  const [activeTemplateWindowResizeDirection, setActiveTemplateWindowResizeDirection] =
    useState<TemplateWindowResizeDirection | null>(null);
  const [templateWindowOrganizerOpen, setTemplateWindowOrganizerOpen] = useState(false);
  const [templateWindowOrganizerOrder, setTemplateWindowOrganizerOrder] = useState<
    TemplateWindowId[]
  >(DEFAULT_TEMPLATE_WINDOW_ORDER);
  const [draggingTemplateWindowId, setDraggingTemplateWindowId] = useState<TemplateWindowId | null>(
    null,
  );
  const [draggingTemplateSection, setDraggingTemplateSection] = useState<"workspace" | "history" | null>(null);
  const [draggingTemplatePane, setDraggingTemplatePane] = useState<"composer" | "catalog" | null>(null);
  const [templateWindowSizes, setTemplateWindowSizes] = useState<
    Record<TemplateWindowId, TemplateWindowSize>
  >(DEFAULT_TEMPLATE_WINDOW_SIZES);
  const registrationDatePickerRef = useRef<HTMLInputElement | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const templateHeaderFileInputRef = useRef<HTMLInputElement | null>(null);

  const customers: CustomerRow[] = customerSource.map((customer) => ({
    ...customer,
    risk: calculateRiskScore(customer),
    daysSinceRegistration: daysSinceIsoDate(customer.registrationDate),
  }));
  const recoveryOverview = useMemo(() => buildRecoveryOverview(customerSource), [customerSource]);
  const overdueCount = customers.filter((customer) => customer.openAmount > 0).length;
  const paidCount = customers.length - overdueCount;
  const previewTemplateSamples = useMemo<Record<string, string>>(
    () => ({
      empresa:
        String(currentUserProfile?.company?.name || "").trim() || "Sua empresa",
      funcionario:
        String(currentUserProfile?.name || currentUserProfile?.username || "").trim() ||
        "Atendente",
      cliente: "Maria Oliveira",
      data_servico: "12/03/2026",
      descricao_servico: "manutencao preventiva",
      valor_formatado: "R$ 480,00",
      quantidade_parcelas: "3",
      valor_parcela_formatado: "R$ 160,00",
      link_pagamento: "https://pagamentos.hbx.app/exemplo",
    }),
    [currentUserProfile],
  );
  const previewComposer = useDeferredValue(templateComposer);
  const botActionOptions = useMemo(
    () =>
      botConfig.actionCatalog.map((action) => ({
        value: String(action.actionId || ""),
        label: action.custom ? `${action.title} (custom)` : action.title,
      })),
    [botConfig.actionCatalog],
  );
  useEffect(() => {
    if (!notice) return;
    setNoticeHistory((current) => {
      if (current[0]?.message === notice) return current;
      const tone: RecoveryNoticeHistoryItem["tone"] = /^falha\b/i.test(notice)
        ? "error"
        : "info";
      return [
        {
          id: `${Date.now()}-${current.length}`,
          message: notice,
          tone,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 8);
    });
  }, [notice]);
  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) => {
        switch (customerRegisterFilter) {
          case "paid":
            return customer.openAmount <= 0;
          case "aged30":
            return customer.openAmount > 0 && customer.daysSinceRegistration >= 30;
          case "aged60":
            return customer.openAmount > 0 && customer.daysSinceRegistration >= 60;
          case "risk_high":
            return customer.openAmount > 0 && customer.risk.tone === "high";
          case "automation_on":
            return customer.automationEnabled;
          case "automation_off":
            return !customer.automationEnabled;
          case "all":
            return true;
          case "overdue":
          default:
            return customer.openAmount > 0;
        }
      }),
    [customerRegisterFilter, customers],
  );
  const selectedCustomerIdSet = useMemo(() => new Set(selectedCustomerIds), [selectedCustomerIds]);
  const allFilteredCustomersSelected =
    filteredCustomers.length > 0 &&
    filteredCustomers.every((customer) => selectedCustomerIdSet.has(customer.id));
  const selectedFilteredCustomersCount = filteredCustomers.filter((customer) =>
    selectedCustomerIdSet.has(customer.id),
  ).length;
  const noticeTone = notice && /^falha\b/i.test(notice) ? "error" : "info";
  const botEditorStartTemplates = useMemo(
    () => buildBotEditorStartTemplates(metaTemplates),
    [metaTemplates],
  );
  const orderedTemplateWindows = useMemo(
    () => normalizeTemplateWindowOrder(recoveryLayoutDraft.templates.windowOrder),
    [recoveryLayoutDraft.templates.windowOrder],
  );
  const deckTemplateWindows = useMemo(
    () => orderedTemplateWindows.filter((item) => item !== "preview"),
    [orderedTemplateWindows],
  );
  const selectedStartTemplate = useMemo(() => {
    const selected = botConfig.startTemplates.find((item) => item.active) || null;
    if (!selected?.name) return null;
    return (
      metaTemplates.templates.find(
        (item) =>
          item.name.toLowerCase() === selected.name.toLowerCase() &&
          item.language.toLowerCase() === selected.language.toLowerCase(),
      ) || null
    );
  }, [botConfig.startTemplates, metaTemplates.templates]);
  const selectedStartTemplateIssues = useMemo(
    () => getRecoveryStartTemplateIssues(selectedStartTemplate),
    [selectedStartTemplate],
  );
  const botStudioTemplateStart = useMemo<BotStudioTemplateStart | null>(() => {
    if (!selectedStartTemplate) return null;
    const view = getTemplateViewModel(selectedStartTemplate);
    return {
      id: "template_start",
      title: `${selectedStartTemplate.name} (${selectedStartTemplate.language})`,
      description: "Template inicial fixo aprovado na Meta antes das etapas livres do builder.",
      body: view.bodyText
        ? renderTemplatePreviewText(view.bodyText, previewTemplateSamples)
        : "Sem body retornado pela Meta.",
      footer: view.footerText || null,
      buttons:
        view.buttons.map((button) => String(button.text || "").trim()).filter(Boolean).slice(0, 3),
      badges: ["HBX ativo", "Meta aprovado"],
      tone: selectedStartTemplateIssues.length > 0 ? "warning" : "ready",
    };
  }, [previewTemplateSamples, selectedStartTemplate, selectedStartTemplateIssues.length]);
  const botStudioTemplateOptions = useMemo(
    () =>
      botEditorStartTemplates.map((template) => {
        const templateRecord =
          metaTemplates.templates.find(
            (item) =>
              item.name.toLowerCase() === template.name.toLowerCase() &&
              item.language.toLowerCase() === template.language.toLowerCase(),
          ) || null;
        const templateIssues = getRecoveryStartTemplateIssues(templateRecord);
        const selected = Boolean(
          botConfig.startTemplates.find(
            (item) =>
              item.active &&
              item.name === template.name &&
              item.language === template.language,
          ),
        );
        return {
          id: `${template.name}::${template.language}`,
          title: template.name,
          subtitle: template.language,
          selected,
          ready: templateIssues.length === 0,
          issues: templateIssues,
        };
      }),
    [botConfig.startTemplates, botEditorStartTemplates, metaTemplates.templates],
  );
  const recoveryChartSeries = useMemo(
    () => buildRecoveryChartSeries(customerSource, 6),
    [customerSource],
  );
  const recoveryChartSvg = useMemo(() => {
    const width = 820;
    const height = 240;
    const left = 26;
    const right = 26;
    const top = 18;
    const bottom = 38;
    const values = recoveryChartSeries.map((item) => Number(item.recovered || 0));
    const maxValue = Math.max(1, ...values);
    const xStep =
      recoveryChartSeries.length > 1
        ? (width - left - right) / (recoveryChartSeries.length - 1)
        : width - left - right;
    const toY = (value: number) => top + (1 - value / maxValue) * (height - top - bottom);
    const points = recoveryChartSeries.map((item, index) => ({
      x: left + xStep * index,
      y: toY(Number(item.recovered || 0)),
      value: Number(item.recovered || 0),
      label: item.label,
    }));

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
    const areaPath = points.length
      ? `${linePath} L${points[points.length - 1].x.toFixed(2)} ${(height - bottom).toFixed(2)} L${points[0].x.toFixed(2)} ${(height - bottom).toFixed(2)} Z`
      : "";
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const value = Number((maxValue * (1 - ratio)).toFixed(0));
      const y = top + ratio * (height - top - bottom);
      return { y, value };
    });
    const latest = recoveryChartSeries[recoveryChartSeries.length - 1];
    const total = recoveryChartSeries.reduce((sum, item) => sum + Number(item.recovered || 0), 0);
    return { width, height, left, right, top, bottom, points, linePath, areaPath, gridLines, latest, total };
  }, [recoveryChartSeries]);
  const composerVariables = useMemo(
    () => extractTemplateVariables(templateComposer.bodyText),
    [templateComposer.bodyText],
  );
  const composerOrderedVariables = useMemo(
    () => extractTemplateVariablesInOrder(templateComposer.bodyText),
    [templateComposer.bodyText],
  );
  const composerPreviewButtons = useMemo(
    () => parseTemplateButtonLines(previewComposer.buttonsText),
    [previewComposer.buttonsText],
  );
  const composerButtonLines = useMemo(
    () =>
      String(templateComposer.buttonsText || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    [templateComposer.buttonsText],
  );
  const composerUsesNamedVariables = useMemo(
    () => composerOrderedVariables.some((item) => !isNumericTemplateVariableKey(item)),
    [composerOrderedVariables],
  );
  const composerUsesNumericVariables = useMemo(
    () => composerOrderedVariables.some((item) => isNumericTemplateVariableKey(item)),
    [composerOrderedVariables],
  );
  const missingRecoveryVars = useMemo(() => {
    const required = ["empresa", "cliente", "data_servico"];
    return required.filter((item) => !composerVariables.includes(item));
  }, [composerVariables]);
  const composerVariableMap = useMemo(
    () =>
      composerOrderedVariables.map((key, index) => ({
        friendly: `{{${key}}}`,
        meta: `{{${index + 1}}}`,
      })),
    [composerOrderedVariables],
  );
  const composerVariableExamples = useMemo(
    () =>
      buildComposerVariableExamples(
        composerOrderedVariables,
        templateComposer.variableExamples,
        previewTemplateSamples,
      ),
    [composerOrderedVariables, previewTemplateSamples, templateComposer.variableExamples],
  );
  const normalizedComposerName = useMemo(
    () =>
      String(templateComposer.name || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_{2,}/g, "_")
        .replace(/^_+|_+$/g, ""),
    [templateComposer.name],
  );
  const composerBlockingIssues = useMemo(() => {
    const issues: string[] = [];
    const rawName = String(templateComposer.name || "").trim();
    const bodyText = String(templateComposer.bodyText || "").trim();
    const footerText = String(templateComposer.footerText || "").trim();
    const headerText = String(templateComposer.headerText || "").trim();

    if (rawName && !normalizedComposerName) {
      issues.push("Nome interno invalido. Use apenas letras minusculas, numeros e underscore.");
    }
    if (!bodyText) {
      issues.push("Corpo do template obrigatorio.");
    } else {
      if (bodyText.length < 10) issues.push("Corpo do template muito curto. Use pelo menos 10 caracteres.");
      if (bodyText.length > 1024) issues.push("Corpo do template excede 1024 caracteres.");
      if (startsWithTemplateVariable(bodyText)) {
        issues.push("Corpo do template nao pode comecar com variavel.");
      }
      if (endsWithTemplateVariable(bodyText)) {
        issues.push("Corpo do template nao pode terminar com variavel.");
      }
    }
    if (templateComposer.enforceRecoveryVars && missingRecoveryVars.length > 0) {
      issues.push(
        `Faltam variaveis obrigatorias do Recovery: ${missingRecoveryVars
          .map((item) => `{{${item}}}`)
          .join(", ")}`,
      );
    }
    if (templateComposer.variableMode === "NAME" && composerUsesNumericVariables) {
      issues.push("Modo Nome exige placeholders com nome, por exemplo {{empresa}}.");
    }
    if (templateComposer.variableMode === "NUMBER" && composerUsesNamedVariables) {
      issues.push("Modo Numero exige placeholders numerados, por exemplo {{1}}, {{2}}.");
    }
    if (templateComposer.variableMode === "NUMBER" && templateComposer.enforceRecoveryVars) {
      issues.push("Validacao automatica do Recovery so funciona no modo Nome.");
    }
    if (templateComposer.headerFormat === "TEXT") {
      if (!headerText) issues.push("Informe o texto do cabecalho.");
      if (headerText.length > 60) issues.push("Cabecalho de texto excede 60 caracteres.");
      if (extractTemplateVariables(headerText).length > 0) {
        issues.push("Cabecalho de texto nao aceita variaveis.");
      }
    }
    if (
      (templateComposer.headerFormat === "IMAGE" ||
        templateComposer.headerFormat === "DOCUMENT" ||
        templateComposer.headerFormat === "VIDEO") &&
      !String(templateComposer.headerHandle || "").trim()
    ) {
      issues.push("Cabecalho com midia exige handle valido da Meta.");
    }
    if (
      templateComposer.activateInHbx &&
      (templateComposer.headerFormat === "IMAGE" ||
        templateComposer.headerFormat === "DOCUMENT" ||
        templateComposer.headerFormat === "VIDEO") &&
      !String(templateComposer.headerMediaUrl || "").trim()
    ) {
      issues.push("Template com midia ativo no HBX exige URL publica da midia.");
    }
    if (footerText) {
      if (footerText.length > 60) issues.push("Rodape excede 60 caracteres.");
      if (extractTemplateVariables(footerText).length > 0) {
        issues.push("Rodape nao aceita variaveis.");
      }
      if (startsWithTemplateVariable(footerText) || endsWithTemplateVariable(footerText)) {
        issues.push("Rodape nao deve comecar nem terminar com variavel.");
      }
    }
    if (composerButtonLines.length > 3) {
      issues.push("A Meta aceita no maximo 3 botoes rapidos.");
    }
    const oversizedButton = composerButtonLines.find((item) => item.length > 25);
    if (oversizedButton) {
      issues.push(`Botao '${oversizedButton}' excede 25 caracteres.`);
    }
    return issues;
  }, [
    composerButtonLines,
    composerUsesNamedVariables,
    composerUsesNumericVariables,
    missingRecoveryVars,
    normalizedComposerName,
    templateComposer.activateInHbx,
    templateComposer.bodyText,
    templateComposer.enforceRecoveryVars,
    templateComposer.footerText,
    templateComposer.headerFormat,
    templateComposer.headerHandle,
    templateComposer.headerMediaUrl,
    templateComposer.headerText,
    templateComposer.variableMode,
  ]);
  const composerComplianceRows = useMemo(
    () => [
      {
        label: "Nome",
        detail: normalizedComposerName || "Use letras minusculas, numeros e underscore.",
        state: normalizedComposerName ? "ok" : "error",
      },
      {
        label: "Body",
        detail: `${String(templateComposer.bodyText || "").trim().length}/1024 caracteres`,
        state:
          String(templateComposer.bodyText || "").trim().length >= 10 &&
          String(templateComposer.bodyText || "").trim().length <= 1024 &&
          !startsWithTemplateVariable(templateComposer.bodyText) &&
          !endsWithTemplateVariable(templateComposer.bodyText)
            ? "ok"
            : "error",
      },
      {
        label: "Variaveis",
        detail:
          composerVariableMap.length > 0
            ? composerVariableMap.map((item) => `${item.friendly} -> ${item.meta}`).join(" | ")
            : templateComposer.variableMode === "NAME"
              ? "Use nomes como {{empresa}} e {{funcionario}}"
              : "Use numeros como {{1}} e {{2}}",
        state:
          (!templateComposer.enforceRecoveryVars || missingRecoveryVars.length === 0) &&
          ((templateComposer.variableMode === "NAME" && !composerUsesNumericVariables) ||
            (templateComposer.variableMode === "NUMBER" && !composerUsesNamedVariables))
            ? "ok"
            : "error",
      },
      {
        label: "Cabecalho",
        detail:
          templateComposer.headerFormat === "NONE"
            ? "Sem cabecalho"
            : templateComposer.headerFormat === "TEXT"
              ? `${String(templateComposer.headerText || "").trim().length}/60 caracteres`
              : "Midia com handle Meta",
        state:
          templateComposer.headerFormat === "TEXT"
            ? String(templateComposer.headerText || "").trim().length > 0 &&
              String(templateComposer.headerText || "").trim().length <= 60 &&
              extractTemplateVariables(templateComposer.headerText).length === 0
              ? "ok"
              : "error"
            : templateComposer.headerFormat === "IMAGE" ||
                templateComposer.headerFormat === "DOCUMENT" ||
                templateComposer.headerFormat === "VIDEO"
              ? String(templateComposer.headerHandle || "").trim()
                ? "ok"
                : "error"
              : "ok",
      },
      {
        label: "Rodape",
        detail: `${String(templateComposer.footerText || "").trim().length}/60 caracteres`,
        state:
          String(templateComposer.footerText || "").trim().length <= 60 &&
          extractTemplateVariables(templateComposer.footerText).length === 0
            ? "ok"
            : "error",
      },
      {
        label: "Botoes",
        detail: `${composerButtonLines.length}/3 botoes`,
        state:
          composerButtonLines.length <= 3 &&
          composerButtonLines.every((item) => item.length <= 25)
            ? "ok"
            : "error",
      },
    ],
    [
      composerButtonLines,
      composerUsesNamedVariables,
      composerUsesNumericVariables,
      composerVariableMap,
      missingRecoveryVars.length,
      normalizedComposerName,
      templateComposer.bodyText,
      templateComposer.enforceRecoveryVars,
      templateComposer.footerText,
      templateComposer.headerFormat,
      templateComposer.headerHandle,
      templateComposer.headerText,
      templateComposer.variableMode,
    ],
  );
  const previewHeaderText = useMemo(
    () => renderTemplatePreviewText(previewComposer.headerText, previewTemplateSamples),
    [previewComposer.headerText, previewTemplateSamples],
  );
  const previewBodyText = useMemo(
    () => renderTemplatePreviewText(previewComposer.bodyText, previewTemplateSamples),
    [previewComposer.bodyText, previewTemplateSamples],
  );
  const previewFooterText = useMemo(
    () => renderTemplatePreviewText(previewComposer.footerText, previewTemplateSamples),
    [previewComposer.footerText, previewTemplateSamples],
  );
  const previewTimeLabel = useMemo(
    () =>
      new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [],
  );
  const activeRecoveryLayout = recoveryLayoutDraft;
  const recoveryLayoutDirty = useMemo(
    () =>
      JSON.stringify(normalizeRecoveryLayoutConfig(recoveryLayoutDraft)) !==
      JSON.stringify(normalizeRecoveryLayoutConfig(recoveryLayout)),
    [recoveryLayout, recoveryLayoutDraft],
  );
  const templatesWorkspaceStyle = useMemo(
    () =>
      ({
        "--templates-primary-width": `${activeRecoveryLayout.templates.workspacePrimaryPercent}%`,
        "--templates-secondary-width": `${100 - activeRecoveryLayout.templates.workspacePrimaryPercent}%`,
        "--template-catalog-height": `${activeRecoveryLayout.templates.catalogHeight}px`,
        "--template-composer-height": `${activeRecoveryLayout.templates.composerHeight}px`,
      }) as CSSProperties,
    [
      activeRecoveryLayout.templates.catalogHeight,
      activeRecoveryLayout.templates.composerHeight,
      activeRecoveryLayout.templates.workspacePrimaryPercent,
    ],
  );
  const templateComposerLayoutStyle = useMemo(
    () =>
      ({
        "--composer-form-width": `${100 - activeRecoveryLayout.templates.composerPreviewPercent}%`,
        "--composer-preview-width": `${activeRecoveryLayout.templates.composerPreviewPercent}%`,
      }) as CSSProperties,
    [activeRecoveryLayout.templates.composerPreviewPercent],
  );
  const templatesSectionFlowStyle = useMemo(
    () => ({ "--templates-preview-reserve": "0px" } as CSSProperties),
    [],
  );
  const templateWindowStyleById = useMemo<
    Record<TemplateWindowId, CSSProperties>
  >(
    () => ({
      composer: {
        width:
          typeof templateWindowSizes.composer.width === "number"
            ? `${templateWindowSizes.composer.width}px`
            : undefined,
        height:
          typeof templateWindowSizes.composer.height === "number"
            ? `${templateWindowSizes.composer.height}px`
            : undefined,
      },
      catalog: {
        width:
          typeof templateWindowSizes.catalog.width === "number"
            ? `${templateWindowSizes.catalog.width}px`
            : undefined,
        height:
          typeof templateWindowSizes.catalog.height === "number"
            ? `${templateWindowSizes.catalog.height}px`
            : undefined,
      },
      history: {
        width:
          typeof templateWindowSizes.history.width === "number"
            ? `${templateWindowSizes.history.width}px`
            : undefined,
        height:
          typeof templateWindowSizes.history.height === "number"
            ? `${templateWindowSizes.history.height}px`
            : undefined,
      },
      preview: {
        width:
          typeof templateWindowSizes.preview.width === "number"
            ? `${templateWindowSizes.preview.width}px`
            : undefined,
        height:
          typeof templateWindowSizes.preview.height === "number"
            ? `${templateWindowSizes.preview.height}px`
            : undefined,
      },
    }),
    [templateWindowSizes],
  );
  const isCatalogLeadPane = activeRecoveryLayout.templates.workspaceLeadPane === "catalog";
  const composerPaneOrder = isCatalogLeadPane ? 3 : 1;
  const catalogPaneOrder = isCatalogLeadPane ? 1 : 3;

  useEffect(() => {
    if (templateWindowOrganizerOpen) return;
    setTemplateWindowOrganizerOrder(deckTemplateWindows);
  }, [deckTemplateWindows, templateWindowOrganizerOpen]);

  useEffect(() => {
    if (templatePreviewTransitionTimerRef.current !== null) {
      window.clearTimeout(templatePreviewTransitionTimerRef.current);
      templatePreviewTransitionTimerRef.current = null;
    }

    if (templateComposerPreviewVisible) {
      setTemplatePreviewRendered(true);
      setTemplatePreviewTransitionStage("enter");
      templatePreviewTransitionTimerRef.current = window.setTimeout(() => {
        setTemplatePreviewTransitionStage("idle");
        templatePreviewTransitionTimerRef.current = null;
      }, 240);
      return;
    }

    if (!templatePreviewRendered) {
      setTemplatePreviewTransitionStage("idle");
      return;
    }

    setTemplatePreviewTransitionStage("exit");
    templatePreviewTransitionTimerRef.current = window.setTimeout(() => {
      setTemplatePreviewRendered(false);
      setTemplatePreviewTransitionStage("idle");
      templatePreviewTransitionTimerRef.current = null;
    }, 170);
  }, [templateComposerPreviewVisible, templatePreviewRendered]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (customerRefreshTimerRef.current !== null) {
        window.clearTimeout(customerRefreshTimerRef.current);
      }
      if (tabTransitionTimerRef.current !== null) {
        window.clearTimeout(tabTransitionTimerRef.current);
      }
      if (templatePreviewTransitionTimerRef.current !== null) {
        window.clearTimeout(templatePreviewTransitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeLayoutResizeAxis) return;

    const handlePointerMove = (event: PointerEvent) => {
      const session = layoutResizeSessionRef.current;
      if (!session) return;
      const { rect, target, orientation } = session;
      if (target === "workspace") {
        const nextPercent =
          orientation === "row"
            ? clampLayoutPercent(((event.clientX - rect.left) / rect.width) * 100, 40, 72)
            : clampLayoutPercent(((event.clientY - rect.top) / rect.height) * 100, 40, 72);
        updateRecoveryLayoutDraft((current) => ({
          ...current,
          templates: {
            ...current.templates,
            workspacePrimaryPercent: nextPercent,
          },
        }));
        return;
      }
      if (target === "catalog") {
        const nextHeight =
          orientation === "column"
            ? clampLayoutPercent(event.clientY - rect.top, 360, 1400)
            : clampLayoutPercent(event.clientX - rect.left, 360, 1400);
        updateRecoveryLayoutDraft((current) => ({
          ...current,
          templates: {
            ...current.templates,
            catalogHeight: nextHeight,
          },
        }));
        return;
      }
      if (target === "composerCard") {
        const nextHeight =
          orientation === "column"
            ? clampLayoutPercent(event.clientY - rect.top, 480, 1600)
            : clampLayoutPercent(event.clientX - rect.left, 480, 1600);
        updateRecoveryLayoutDraft((current) => ({
          ...current,
          templates: {
            ...current.templates,
            composerHeight: nextHeight,
          },
        }));
        return;
      }

      const previewPercent =
        orientation === "row"
          ? clampLayoutPercent(((rect.left + rect.width - event.clientX) / rect.width) * 100, 34, 62)
          : clampLayoutPercent(((rect.top + rect.height - event.clientY) / rect.height) * 100, 34, 62);
      updateRecoveryLayoutDraft((current) => ({
        ...current,
        templates: {
          ...current.templates,
          composerPreviewPercent: previewPercent,
        },
      }));
    };

    const stopResize = () => {
      layoutResizeSessionRef.current = null;
      setActiveLayoutResizeAxis(null);
    };

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = activeLayoutResizeAxis === "col" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
  }, [activeLayoutResizeAxis]);

  useEffect(() => {
    if (!activeTemplateWindowResizeDirection) return;

    const handlePointerMove = (event: PointerEvent) => {
      const session = templateWindowResizeSessionRef.current;
      if (!session) return;
      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      const horizontalDelta =
        session.direction.includes("e") ? dx : session.direction.includes("w") ? -dx : 0;
      const verticalDelta =
        session.direction.includes("s") ? dy : session.direction.includes("n") ? -dy : 0;

      const minWidth = session.id === "preview" ? 300 : 280;
      const maxWidth = session.id === "preview" ? Math.max(340, window.innerWidth - 24) : 1600;
      const minHeight = session.id === "preview" ? 420 : 220;
      const maxHeight = session.id === "preview" ? Math.max(420, window.innerHeight - 48) : 1800;

      const nextWidth = clampLayoutPercent(
        session.startWidth + horizontalDelta,
        minWidth,
        maxWidth,
      );
      const nextHeight = clampLayoutPercent(
        session.startHeight + verticalDelta,
        minHeight,
        maxHeight,
      );

      setTemplateWindowSizes((current) => ({
        ...current,
        [session.id]: {
          width: session.direction === "n" || session.direction === "s" ? current[session.id].width : nextWidth,
          height: session.direction === "e" || session.direction === "w" ? current[session.id].height : nextHeight,
        },
      }));
    };

    const stopResize = () => {
      templateWindowResizeSessionRef.current = null;
      setActiveTemplateWindowResizeDirection(null);
    };

    const cursorMap: Record<TemplateWindowResizeDirection, string> = {
      n: "ns-resize",
      s: "ns-resize",
      e: "ew-resize",
      w: "ew-resize",
      ne: "nesw-resize",
      nw: "nwse-resize",
      se: "nwse-resize",
      sw: "nesw-resize",
    };

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = cursorMap[activeTemplateWindowResizeDirection];
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
  }, [activeTemplateWindowResizeDirection]);

  useEffect(() => {
    if (noticeTransitionTimerRef.current !== null) {
      window.clearTimeout(noticeTransitionTimerRef.current);
      noticeTransitionTimerRef.current = null;
    }
    if (noticeAutoDismissTimerRef.current !== null) {
      window.clearTimeout(noticeAutoDismissTimerRef.current);
      noticeAutoDismissTimerRef.current = null;
    }
    if (noticeCloseLockTimerRef.current !== null) {
      window.clearTimeout(noticeCloseLockTimerRef.current);
      noticeCloseLockTimerRef.current = null;
    }

    if (notice) {
      if (!noticeRendered) {
        setNoticeRendered(true);
      }
      setNoticeCloseReady(false);
      setNoticeTransitionStage("enter");
      noticeTransitionTimerRef.current = window.setTimeout(() => {
        setNoticeTransitionStage("idle");
        noticeTransitionTimerRef.current = null;
      }, 240);
      noticeCloseLockTimerRef.current = window.setTimeout(() => {
        setNoticeCloseReady(true);
        noticeCloseLockTimerRef.current = null;
      }, 1800);
      noticeAutoDismissTimerRef.current = window.setTimeout(() => {
        setNotice(null);
        noticeAutoDismissTimerRef.current = null;
      }, 7000);
      return;
    }

    if (noticeRendered) {
      setNoticeTransitionStage("exit");
      noticeTransitionTimerRef.current = window.setTimeout(() => {
        setNoticeRendered(false);
        setNoticeTransitionStage("idle");
        noticeTransitionTimerRef.current = null;
      }, 170);
    }
  }, [notice, noticeRendered]);

  useEffect(() => {
    return () => {
      if (noticeTransitionTimerRef.current !== null) {
        window.clearTimeout(noticeTransitionTimerRef.current);
      }
      if (noticeAutoDismissTimerRef.current !== null) {
        window.clearTimeout(noticeAutoDismissTimerRef.current);
      }
      if (noticeCloseLockTimerRef.current !== null) {
        window.clearTimeout(noticeCloseLockTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hasToken === false) return;
    const timer = window.setInterval(() => {
      void loadInteractions("all", { silent: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeTab, hasToken, interactionDetail?.conversationId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const count = hasToken ? Number(interactionSummary.pendingHumanCount || 0) : 0;
    try {
      window.localStorage.setItem("hbxRecoveryPendingHumanCount", String(Math.max(0, count)));
    } catch {}
    window.dispatchEvent(
      new CustomEvent(RECOVERY_HUMAN_QUEUE_EVENT, {
        detail: { count: Math.max(0, count) },
      }),
    );
  }, [hasToken, interactionSummary.pendingHumanCount]);

  useEffect(() => {
    if (hasToken === false) return;
    let cancelled = false;

    async function loadRecoveryData() {
      setLoadingCustomers(true);
      setLoadingBotConfig(true);
      setLoadingMetaTemplates(true);
      try {
        const [customerRows, botConfigPayload, metaTemplatesPayload, currentUser] = await Promise.all([
          apiFetch<RecoveryCustomer[]>("/hbx-recovery/customers"),
          apiFetch<RecoveryBotConfig>("/hbx-recovery/bot-config"),
          apiFetch<RecoveryMetaTemplatesPayload>("/hbx-recovery/meta-templates").catch(
            () => DEFAULT_META_TEMPLATES_PAYLOAD,
          ),
          apiFetch<RecoveryCurrentUserPayload>("/profile/current-user").catch(() => null),
        ]);
        if (cancelled) return;
        setCustomerSource(Array.isArray(customerRows) ? customerRows : []);
        setCurrentUserProfile(currentUser);
        const safeMetaPayload = normalizeMetaTemplatesPayload(metaTemplatesPayload);
        const storageKey = buildRecoveryLayoutStorageKey(currentUser?.id);
        const safeLayout = readRecoveryLayoutFromStorage(storageKey);
        setMetaTemplates(safeMetaPayload);
        setRecoveryLayoutStorageKey(storageKey);
        setRecoveryLayout(safeLayout);
        setRecoveryLayoutDraft(safeLayout);
        setBotConfig(
          syncBotConfigWithMetaTemplates(
            ensureBotConfigShape(botConfigPayload || DEFAULT_BOT_CONFIG),
            safeMetaPayload,
          ),
        );
        setNotice(
          safeMetaPayload.syncError
            ? `Falha ao sincronizar templates Meta: ${safeMetaPayload.syncError}`
            : null,
        );
      } catch (error) {
        if (cancelled) return;
        const reason = error instanceof Error ? error.message : "Erro ao carregar Recovery";
        setNotice(`Falha ao carregar Recovery: ${reason}`);
      } finally {
        if (!cancelled) {
          setLoadingCustomers(false);
          setLoadingBotConfig(false);
          setLoadingMetaTemplates(false);
        }
      }
    }

    loadRecoveryData();
    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  async function reloadCustomers() {
    const rows = await apiFetch<RecoveryCustomer[]>("/hbx-recovery/customers");
    setCustomerSource(Array.isArray(rows) ? rows : []);
  }

  useEffect(() => {
    const visibleIds = new Set(filteredCustomers.map((customer) => customer.id));
    setSelectedCustomerIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [filteredCustomers]);

  function mergeCustomersIntoState(nextCustomers: RecoveryCustomer[]) {
    if (!Array.isArray(nextCustomers) || nextCustomers.length === 0) return;
    setCustomerSource((current) => {
      const nextMap = new Map(nextCustomers.map((item) => [item.id, item]));
      return current.map((item) => nextMap.get(item.id) || item);
    });
  }

  function scheduleCustomerRefresh() {
    if (customerRefreshTimerRef.current !== null) {
      window.clearTimeout(customerRefreshTimerRef.current);
    }
    customerRefreshTimerRef.current = window.setTimeout(() => {
      customerRefreshTimerRef.current = null;
      void reloadCustomers().catch(() => undefined);
    }, 6500);
  }

  async function saveCustomerAutomation(customerId: string, enabled: boolean) {
    const result = await apiFetch<{ customer: RecoveryCustomer }>(
      `/hbx-recovery/customers/${customerId}/automation`,
      {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      },
    );
    if (result?.customer) {
      mergeCustomersIntoState([result.customer]);
    }
    return result?.customer || null;
  }

  async function handleBatchAutomationUpdate(enabled: boolean) {
    if (!selectedCustomerIds.length) {
      setNotice("Selecione pelo menos um cliente para atualizar a cobranca automatica.");
      return;
    }
    setCustomerAutomationBatchBusy(enabled ? "enable" : "disable");
    try {
      const result = await apiFetch<{
        updatedCount: number;
        customers: RecoveryCustomer[];
      }>("/hbx-recovery/customers/automation/batch", {
        method: "PATCH",
        body: JSON.stringify({
          customerIds: selectedCustomerIds,
          enabled,
        }),
      });
      mergeCustomersIntoState(result.customers || []);
      setSelectedCustomerIds([]);
      setNotice(
        `${result.updatedCount} cliente${
          result.updatedCount === 1 ? "" : "s"
        } com cobranca automatica ${enabled ? "ativada" : "pausada"}.`,
      );
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Erro ao atualizar cobranca automatica";
      setNotice(`Falha ao atualizar cobranca automatica em lote: ${reason}`);
    } finally {
      setCustomerAutomationBatchBusy(null);
    }
  }

  async function loadMetaTemplates(refresh = false) {
    setLoadingMetaTemplates(true);
    try {
      const query = refresh ? "?refresh=true" : "";
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>(
        `/hbx-recovery/meta-templates${query}`,
      );
      const safePayload = normalizeMetaTemplatesPayload(payload);
      setMetaTemplates(safePayload);
      setBotConfig((current) => syncBotConfigWithMetaTemplates(current, safePayload));
      if (safePayload.syncError) {
        setNotice(`Falha ao carregar templates Meta: ${safePayload.syncError}`);
      }
      return safePayload;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao consultar templates Meta";
      setNotice(`Falha ao carregar templates Meta: ${reason}`);
      return DEFAULT_META_TEMPLATES_PAYLOAD;
    } finally {
      setLoadingMetaTemplates(false);
    }
  }

  async function syncMetaTemplatesNow() {
    setMetaTemplateBusy("sync");
    try {
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>("/hbx-recovery/meta-templates/sync", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const safePayload = normalizeMetaTemplatesPayload(payload);
      setMetaTemplates(safePayload);
      setBotConfig((current) => syncBotConfigWithMetaTemplates(current, safePayload));
      if (safePayload.syncError) {
        setNotice(`Falha ao sincronizar templates Meta: ${safePayload.syncError}`);
      } else {
        setNotice("Templates Meta sincronizados com sucesso.");
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao sincronizar templates";
      setNotice(`Falha ao sincronizar templates Meta: ${reason}`);
    } finally {
      setMetaTemplateBusy(null);
    }
  }

  async function saveRecoveryLayoutConfig() {
    setSavingRecoveryLayout(true);
    try {
      const normalized = normalizeRecoveryLayoutConfig(recoveryLayoutDraft);
      writeRecoveryLayoutToStorage(recoveryLayoutStorageKey, normalized);
      setRecoveryLayout(normalized);
      setRecoveryLayoutDraft(normalized);
      setNotice("Seu modo de exibicao do Recovery foi salvo.");
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Erro ao salvar seu layout do Recovery";
      setNotice(`Falha ao salvar layout do Recovery: ${reason}`);
    } finally {
      setSavingRecoveryLayout(false);
    }
  }

  function restoreRecoveryLayoutConfig() {
    const restored = normalizeRecoveryLayoutConfig(DEFAULT_RECOVERY_LAYOUT_CONFIG);
    writeRecoveryLayoutToStorage(recoveryLayoutStorageKey, restored);
    setRecoveryLayout(restored);
    setRecoveryLayoutDraft(restored);
    setTemplateWindowSizes(DEFAULT_TEMPLATE_WINDOW_SIZES);
    setTemplateComposerPreviewVisible(false);
    setNotice("Layout do Recovery restaurado.");
  }

  function updateRecoveryLayoutDraft(
    updater: (current: RecoveryLayoutConfig) => RecoveryLayoutConfig,
  ) {
    setRecoveryLayoutDraft((current) => normalizeRecoveryLayoutConfig(updater(current)));
  }

  function beginLayoutResize(
    target: "workspace" | "composer" | "catalog" | "composerCard",
    orientation: "row" | "column",
    container: HTMLDivElement | null,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    event.preventDefault();
    layoutResizeSessionRef.current = {
      target,
      orientation,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    };
    setActiveLayoutResizeAxis(orientation === "row" ? "col" : "row");
  }

  function getTemplateWindowElement(id: TemplateWindowId) {
    if (id === "composer") return templateComposerWindowRef.current;
    if (id === "catalog") return templateCatalogWindowRef.current;
    if (id === "history") return templateHistoryWindowRef.current;
    return templatePreviewWindowRef.current;
  }

  function beginTemplateWindowResize(
    id: TemplateWindowId,
    direction: TemplateWindowResizeDirection,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const element = getTemplateWindowElement(id);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    event.preventDefault();
    event.stopPropagation();
    templateWindowResizeSessionRef.current = {
      id,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };
    setActiveTemplateWindowResizeDirection(direction);
  }

  function renderTemplateWindowResizeHandles(id: TemplateWindowId) {
    const directions: TemplateWindowResizeDirection[] = [
      "n",
      "s",
      "e",
      "w",
      "ne",
      "nw",
      "se",
      "sw",
    ];
    return (
      <>
        {directions.map((direction) => (
          <div
            key={`${id}-${direction}`}
            className={`${styles.templateWindowResizeHandle} ${styles[`templateWindowResizeHandle${direction.toUpperCase()}`]}`}
            onPointerDown={(event) => beginTemplateWindowResize(id, direction, event)}
            role="presentation"
          />
        ))}
      </>
    );
  }

  function openTemplateWindowOrganizer(startId?: TemplateWindowId) {
    setTemplateWindowOrganizerOrder(deckTemplateWindows);
    setDraggingTemplateWindowId(
      startId && startId !== "preview" ? startId : null,
    );
    setTemplateWindowOrganizerOpen(true);
  }

  function closeTemplateWindowOrganizer() {
    setDraggingTemplateWindowId(null);
    setTemplateWindowOrganizerOrder(deckTemplateWindows);
    setTemplateWindowOrganizerOpen(false);
  }

  function moveTemplateWindowInOrganizer(
    id: TemplateWindowId,
    direction: "left" | "right",
  ) {
    setTemplateWindowOrganizerOrder((current) =>
      moveTemplateWindowOrder(current, id, direction),
    );
  }

  function applyTemplateWindowOrganizer() {
    const nextOrder = [
      ...normalizeTemplateWindowOrder(templateWindowOrganizerOrder).filter(
        (item) => item !== "preview",
      ),
      "preview" as TemplateWindowId,
    ];
    updateRecoveryLayoutDraft((current) => ({
      ...current,
      templates: {
        ...current.templates,
        windowOrder: nextOrder,
      },
    }));
    setTemplateWindowSizes(DEFAULT_TEMPLATE_WINDOW_SIZES);
    setDraggingTemplateWindowId(null);
    setTemplateWindowOrganizerOpen(false);
    setNotice("Janelas reorganizadas. O HBX reencaixou os paineis automaticamente.");
  }

  function renderTemplateWindowOrganizerGrip(id: TemplateWindowId) {
    return (
      <button
        type="button"
        className={styles.templateWindowGripButton}
        onPointerDown={(event) => {
          event.preventDefault();
          openTemplateWindowOrganizer(id);
        }}
        title="Segure para reorganizar todas as janelas"
        aria-label={`Reorganizar janelas a partir de ${TEMPLATE_WINDOW_LABELS[id]}`}
      >
        <span />
        <span />
        <span />
      </button>
    );
  }

  function setTemplateLeadPane(pane: "composer" | "catalog") {
    updateRecoveryLayoutDraft((current) => ({
      ...current,
      templates: {
        ...current.templates,
        workspaceLeadPane: pane,
      },
    }));
  }

  function updateTemplateComposer(
    updater: (current: RecoveryTemplateComposer) => RecoveryTemplateComposer,
  ) {
    setTemplateComposer((current) => updater(current));
    setTemplateComposerPreviewVisible(true);
  }

  function updateTemplateComposerVariableExample(variableKey: string, value: string) {
    const normalizedKey = normalizeTemplateVariableKey(variableKey);
    updateTemplateComposer((current) => ({
      ...current,
      variableExamples: {
        ...current.variableExamples,
        [normalizedKey]: value,
      },
    }));
  }

  function setWorkspaceLayoutMode(mode: "row" | "column") {
    updateRecoveryLayoutDraft((current) => {
      return {
        ...current,
        templates: {
          ...current.templates,
          workspaceMode: mode,
        },
      };
    });
  }

  function setComposerLayoutMode(mode: "row" | "column") {
    updateRecoveryLayoutDraft((current) => ({
      ...current,
      templates: {
        ...current.templates,
        composerMode: mode,
      },
    }));
  }

  function focusWorkspacePanel(panel: "primary" | "secondary") {
    updateRecoveryLayoutDraft((current) => {
      const currentPercent = current.templates.workspacePrimaryPercent;
      const nextPercent = clampLayoutPercent(
        currentPercent + (panel === "primary" ? 6 : -6),
        40,
        72,
      );
      return {
        ...current,
        templates: {
          ...current.templates,
          workspaceMode: "row",
          workspacePrimaryPercent: nextPercent,
        },
      };
    });
  }

  function focusComposerPanel(panel: "form" | "preview") {
    updateRecoveryLayoutDraft((current) => {
      const currentPercent = current.templates.composerPreviewPercent;
      const nextPercent = clampLayoutPercent(
        currentPercent + (panel === "preview" ? 6 : -6),
        34,
        62,
      );
      return {
        ...current,
        templates: {
          ...current.templates,
          composerMode: "row",
          composerPreviewPercent: nextPercent,
        },
      };
    });
  }

  function setTemplateHistoryPosition(position: "before" | "after") {
    updateRecoveryLayoutDraft((current) => ({
      ...current,
      templates: {
        ...current.templates,
        historyPosition: position,
      },
    }));
  }

  async function toggleTemplateHbxActivation(name: string, language: string, active: boolean) {
    setMetaTemplateBusy(`toggle:${name}:${language}`);
    try {
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>(
        "/hbx-recovery/meta-templates/activation",
        {
          method: "PATCH",
          body: JSON.stringify({ name, language, active }),
        },
      );
      const safePayload = normalizeMetaTemplatesPayload(payload);
      setMetaTemplates(safePayload);
      setBotConfig((current) => syncBotConfigWithMetaTemplates(current, safePayload));
      setNotice(
        active
          ? `Template ${name} ativado no HBX.`
          : `Template ${name} desativado no HBX.`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao alterar ativacao do template";
      setNotice(`Falha ao atualizar template: ${reason}`);
    } finally {
      setMetaTemplateBusy(null);
    }
  }

  async function deleteMetaTemplate(template: RecoveryMetaTemplateItem) {
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Excluir o template '${template.name}' (${template.language}) na Meta e no HBX? Essa acao nao tem volta.`,
          );
    if (!confirmed) return;

    setMetaTemplateBusy(`delete:${template.name}:${template.language}`);
    try {
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>("/hbx-recovery/meta-templates", {
        method: "DELETE",
        body: JSON.stringify({
          id: template.id,
          name: template.name,
          language: template.language,
        }),
      });
      const safePayload = normalizeMetaTemplatesPayload(payload);
      setMetaTemplates(safePayload);
      setBotConfig((current) => syncBotConfigWithMetaTemplates(current, safePayload));
      setNotice(`Template ${template.name} excluido na Meta e removido do HBX.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao excluir template";
      setNotice(`Falha ao excluir template: ${reason}`);
    } finally {
      setMetaTemplateBusy(null);
    }
  }

  function updateTemplateHeaderMediaUrl(name: string, language: string, value: string) {
    setMetaTemplates((current) => ({
      ...current,
      templates: current.templates.map((item) =>
        item.name === name && item.language === language
          ? {
              ...item,
              headerMediaUrl: value,
              normalized: {
                ...item.normalized,
                header: {
                  ...item.normalized.header,
                  mediaUrl: value,
                },
              },
            }
          : item,
      ),
    }));
  }

  async function saveTemplateHeaderMediaUrl(name: string, language: string) {
    const template = metaTemplates.templates.find(
      (item) => item.name === name && item.language === language,
    );
    if (!template) return;
    const view = getTemplateViewModel(template);

    setMetaTemplateBusy(`config:${name}:${language}`);
    try {
      const payload = await apiFetch<RecoveryMetaTemplatesPayload>(
        "/hbx-recovery/meta-templates/activation",
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
            language,
            active: template.hbxActive,
            headerMediaUrl: view.headerMediaUrl || "",
          }),
        },
      );
      const safePayload = normalizeMetaTemplatesPayload(payload);
      setMetaTemplates(safePayload);
      setBotConfig((current) => syncBotConfigWithMetaTemplates(current, safePayload));
      setNotice(`URL de midia do template ${name} salva no HBX.`);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Erro ao salvar URL da midia do template";
      setNotice(`Falha ao salvar URL da midia: ${reason}`);
    } finally {
      setMetaTemplateBusy(null);
    }
  }

  async function createMetaTemplate() {
    setTemplateComposerError(null);
    const normalizedName = normalizedComposerName;
    if (!normalizedName) {
      setTemplateComposerError(
        "Informe um nome valido (minusculo, com underscore) para o template.",
      );
      return;
    }
    if (composerBlockingIssues.length > 0) {
      setTemplateComposerError(composerBlockingIssues[0] || "Revise os campos antes de enviar.");
      return;
    }
    const bodyText = String(templateComposer.bodyText || "").trim();
    if (bodyText.length < 10) {
      setTemplateComposerError("Texto do template muito curto.");
      return;
    }
    if (templateComposer.enforceRecoveryVars && missingRecoveryVars.length > 0) {
      setTemplateComposerError(
        `Faltam variaveis obrigatorias do Recovery: ${missingRecoveryVars
          .map((item) => `{{${item}}}`)
          .join(", ")}`,
      );
      return;
    }
    if (templateComposer.headerFormat === "TEXT") {
      const headerText = String(templateComposer.headerText || "").trim();
      if (!headerText) {
        setTemplateComposerError("Informe o texto do cabecalho.");
        return;
      }
      if (headerText.length > 60) {
        setTemplateComposerError("O cabecalho de texto aceita no maximo 60 caracteres.");
        return;
      }
    }
    if (
      (templateComposer.headerFormat === "IMAGE" ||
        templateComposer.headerFormat === "DOCUMENT" ||
        templateComposer.headerFormat === "VIDEO") &&
      !String(templateComposer.headerHandle || "").trim()
    ) {
      setTemplateComposerError(
        "Para cabecalho com logo/midia, informe o header_handle gerado pela Meta.",
      );
      return;
    }
    if (
      templateComposer.activateInHbx &&
      (templateComposer.headerFormat === "IMAGE" ||
        templateComposer.headerFormat === "DOCUMENT" ||
        templateComposer.headerFormat === "VIDEO") &&
      !String(templateComposer.headerMediaUrl || "").trim()
    ) {
      setTemplateComposerError(
        "Para usar o template no HBX, informe a URL publica da midia do cabecalho.",
      );
      return;
    }

    const buttons = parseTemplateButtonLines(templateComposer.buttonsText);
    setMetaTemplateBusy("create");
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
          buttons,
          variableExamples: composerVariableExamples,
          activateInHbx: templateComposer.activateInHbx,
        }),
      });
      const safePayload = normalizeMetaTemplatesPayload(payload);
      setMetaTemplates(safePayload);
      setBotConfig((current) => syncBotConfigWithMetaTemplates(current, safePayload));
      setTemplateComposer((current) => ({
        ...current,
        name: "",
      }));
      setNotice(`Template ${normalizedName} enviado para aprovacao na Meta.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao criar template";
      setTemplateComposerError(reason);
      setNotice(`Falha ao criar template na Meta: ${reason}`);
    } finally {
      setMetaTemplateBusy(null);
    }
  }

  async function uploadTemplateHeaderMedia(file: File) {
    if (!file) return;
    if (!normalizedComposerName) {
      setTemplateComposerError("Informe um nome interno valido antes de enviar a imagem.");
      return;
    }
    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(String(file.type || ""));
    if (!isImage) {
      setTemplateComposerError("Use uma imagem JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setTemplateComposerError("A imagem original deve ter no maximo 25 MB.");
      return;
    }

    setTemplateComposerError(null);
    setMetaTemplateBusy("upload-header");
    try {
      const optimizedFile = await compressTemplateImage(file);
      if (!["image/jpeg", "image/png"].includes(String(optimizedFile.type || "").toLowerCase())) {
        throw new Error("Nao foi possivel converter a imagem para um formato compativel com a Meta.");
      }
      const formData = new FormData();
      formData.append("file", optimizedFile);
      formData.append("templateName", normalizedComposerName || templateComposer.name || "");
      formData.append("language", templateComposer.language || "pt_BR");
      const payload = await apiFetch<RecoveryMetaHeaderUploadPayload>(
        "/hbx-recovery/meta-templates/upload-header-media",
        {
          method: "POST",
          body: formData,
        },
      );
      if (payload.registry) {
        const safePayload = normalizeMetaTemplatesPayload(payload.registry);
        setMetaTemplates(safePayload);
        setBotConfig((current) => syncBotConfigWithMetaTemplates(current, safePayload));
      } else if (normalizedComposerName) {
        setMetaTemplates((current) => ({
          ...current,
          templates: current.templates.map((item) =>
            item.name === normalizedComposerName &&
            item.language === (templateComposer.language || "pt_BR")
              ? {
                  ...item,
                  headerHandle: payload.headerHandle || item.headerHandle,
                  headerMediaUrl: payload.headerMediaUrl || item.headerMediaUrl,
                }
              : item,
          ),
        }));
      }
      updateTemplateComposer((current) => ({
        ...current,
        headerFormat: "IMAGE",
        headerHandle: payload.headerHandle || current.headerHandle,
        headerMediaUrl: payload.headerMediaUrl || current.headerMediaUrl,
      }));
      const reduction =
        optimizedFile.size < file.size
          ? ` Imagem reduzida de ${Math.round(file.size / 1024)} KB para ${Math.round(
              optimizedFile.size / 1024,
            )} KB.`
          : "";
      setNotice(
        `Imagem enviada e vinculada ao template. Arquivo salvo como ${payload.fileName}.${reduction}`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao enviar imagem";
      setTemplateComposerError(reason);
      setNotice(`Falha ao enviar imagem: ${reason}`);
    } finally {
      setMetaTemplateBusy(null);
    }
  }

  function onTemplateHeaderFileChange(event: ReactChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void uploadTemplateHeaderMedia(file);
    }
    event.target.value = "";
  }

  function onTemplateHeaderDrop(event: ReactDragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setTemplateHeaderDropActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void uploadTemplateHeaderMedia(file);
    }
  }

  async function loadPaymentHistory(month = paymentMonth, lifecycle = paymentFilter) {
    if (hasToken === false) return;
    setLoadingPaymentHistory(true);
    try {
      const query = new URLSearchParams();
      query.set("month", month);
      query.set("lifecycle", lifecycle);
      const payload = await apiFetch<RecoveryPaymentHistorySummary>(
        `/hbx-recovery/payments?${query.toString()}`,
      );
      setPaymentSummary(payload);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao carregar histórico de pagamentos";
      setNotice(`Falha no histórico de pagamentos: ${reason}`);
    } finally {
      setLoadingPaymentHistory(false);
    }
  }

  function buildHumanAttentionSignature(input: {
    conversationId: number;
    lastAt: string;
    kind: RecoveryHumanAttentionKind;
  }) {
    return `${input.conversationId}:${input.lastAt}:${input.kind}`;
  }

  function upsertHumanAttentionFeedItem(item: RecoveryHumanAttentionFeedItem) {
    const dismissedSignature = dismissedHumanAttentionRef.current.get(item.conversationId);
    const nextSignature = buildHumanAttentionSignature(item);
    if (dismissedSignature === nextSignature) {
      return;
    }

    setHumanAttentionFeed((current) => {
      const next = current.filter((entry) => entry.conversationId !== item.conversationId);
      return [item, ...next].slice(0, 8);
    });
  }

  function dismissHumanAttention(
    conversationId: number,
    options?: { lastAt?: string; kind?: RecoveryHumanAttentionKind },
  ) {
    if (options?.lastAt && options?.kind) {
      dismissedHumanAttentionRef.current.set(
        conversationId,
        buildHumanAttentionSignature({
          conversationId,
          lastAt: options.lastAt,
          kind: options.kind,
        }),
      );
    }
    setHumanAttentionFeed((current) =>
      current.filter((entry) => entry.conversationId !== conversationId),
    );
    setHumanAttentionPopup((current) =>
      current?.conversationId === conversationId ? null : current,
    );
  }

  async function loadInteractions(
    queue = interactionsQueue,
    options?: { silent?: boolean },
  ) {
    if (hasToken === false) return;
    const silent = options?.silent ?? false;
    if (silent || interactionSummary.conversations.length > 0 || interactionDetail) {
      setRefreshingInteractions(true);
    } else {
      setLoadingInteractions(true);
    }
    setInteractionsError(null);
    try {
      const effectiveQueue = "all" as const;
      const query = new URLSearchParams();
      query.set("queue", effectiveQueue);
      let payload: RecoveryInteractionSummary;
      try {
        payload = await apiFetch<RecoveryInteractionSummary>(
          `/hbx-recovery/interactions?${query.toString()}`,
        );
        if (!Array.isArray(payload?.conversations) || payload.conversations.length === 0) {
          const inboxRows = await apiFetch<RecoveryInboxFallbackConversation[]>("/inbox/conversations");
          payload = mapInboxConversationsToRecoverySummary(inboxRows, effectiveQueue);
        }
      } catch {
        const inboxRows = await apiFetch<RecoveryInboxFallbackConversation[]>("/inbox/conversations");
        payload = mapInboxConversationsToRecoverySummary(inboxRows, effectiveQueue);
      }
      const previousLastSeen = interactionLastSeenRef.current;
      const previousHumanQueue = interactionHumanQueueRef.current;
      const nextLastSeen = new Map<number, string>();
      const nextHumanQueue = new Map<number, boolean>();
      const isInitialLoad = !interactionInitialLoadDoneRef.current;
      let popupCandidate:
        | {
            item: RecoveryInteractionSummary["conversations"][number];
            kind: RecoveryHumanAttentionKind;
          }
        | null = null;

      for (const item of payload.conversations) {
        nextLastSeen.set(item.conversationId, item.lastAt);
        nextHumanQueue.set(item.conversationId, Boolean(item.humanQueue));
        const previousTimestamp = previousLastSeen.get(item.conversationId);
        const previousQueued = previousHumanQueue.get(item.conversationId);
        const isInbound = String(item.lastDirection || "").trim().toUpperCase() === "INBOUND";
        const requiresHumanAttention = Boolean(item.humanQueue || item.humanAssigned);
        const becameHumanQueue = Boolean(item.humanQueue) && previousQueued !== true;
        const hasNewInbound = Boolean(
          previousTimestamp &&
            isInbound &&
            new Date(item.lastAt).getTime() > new Date(previousTimestamp).getTime(),
        );
        if (
          !popupCandidate &&
          ((isInitialLoad && item.humanQueue) ||
            (!isInitialLoad && (becameHumanQueue || (requiresHumanAttention && hasNewInbound))))
        ) {
          popupCandidate = {
            item,
            kind: becameHumanQueue || isInitialLoad ? "human_queue" : "new_message",
          };
        }
      }

      interactionLastSeenRef.current = nextLastSeen;
      interactionHumanQueueRef.current = nextHumanQueue;
      interactionInitialLoadDoneRef.current = true;
      setInteractionsError(null);
      setLastInteractionsSyncAt(new Date().toISOString());
      setInteractionSummary(payload);
      const availableConversationIds = new Set(
        payload.conversations.map((conversation) => conversation.conversationId),
      );
      const currentConversationId = interactionDetail?.conversationId ?? null;
      const nextConversationId =
        currentConversationId && availableConversationIds.has(currentConversationId)
          ? currentConversationId
          : payload.conversations[0]?.conversationId ?? null;
      const nextConversation =
        nextConversationId
          ? payload.conversations.find(
              (conversation) => conversation.conversationId === nextConversationId,
            ) || null
          : null;

      if (
        nextConversationId &&
        (currentConversationId !== nextConversationId ||
          shouldReloadRecoveryInteraction(nextConversation, interactionDetailRef.current))
      ) {
        const nextSkeleton = buildRecoveryInteractionSkeleton(
          nextConversation,
          interactionDetailRef.current?.conversationId === nextConversationId
            ? interactionDetailRef.current
            : null,
        );
        if (nextSkeleton) {
          setInteractionDetail(nextSkeleton);
        }
        void loadInteractionDetail(nextConversationId);
      } else if (
        nextConversation &&
        interactionDetailRef.current?.conversationId === nextConversationId
      ) {
        setInteractionDetail((current) =>
          current && current.conversationId === nextConversationId
            ? {
                ...current,
                botActive: nextConversation.botActive,
                humanAssigned: nextConversation.humanAssigned,
                isBlocked: nextConversation.isBlocked,
                blockedAt: nextConversation.blockedAt,
                blockedReason: nextConversation.blockedReason,
                assignedUserId: nextConversation.assignedUserId,
                currentFlow: nextConversation.currentFlow,
                currentStep: nextConversation.currentStep,
                flowResult: nextConversation.flowResult,
                lastInteractionAt: nextConversation.lastInteractionAt,
              }
            : current,
        );
      } else if (!nextConversationId && currentConversationId) {
        setInteractionDetail(null);
      }

      if (effectiveQueue === "all") {
        const activeHumanAttentionIds = new Set(
          payload.conversations
            .filter((item) => item.humanQueue && !item.isClosed && !item.isBlocked)
            .map((item) => item.conversationId),
        );
        setHumanAttentionFeed((current) =>
          current.filter((entry) => activeHumanAttentionIds.has(entry.conversationId)),
        );
        setHumanAttentionPopup((current) =>
          current && activeHumanAttentionIds.has(current.conversationId) ? current : null,
        );
      }
      if (popupCandidate) {
        void presentHumanAttentionPopup(popupCandidate.item, popupCandidate.kind);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao carregar mensagens do Recovery";
      setInteractionsError(reason);
      if (!silent || interactionSummary.conversations.length === 0) {
        setNotice(`Falha ao carregar mensagens do Recovery: ${reason}`);
      }
    } finally {
      setLoadingInteractions(false);
      setRefreshingInteractions(false);
    }
  }

  async function loadFlowStages(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;
    if (!silent) setLoadingFlowStages(true);
    try {
      const payload = await apiFetch<RecoveryFlowStage[]>("/hbx-recovery/flows");
      setFlowStages(Array.isArray(payload) ? payload : []);
    } catch (error) {
      if (!silent) {
        const reason = error instanceof Error ? error.message : "Falha ao carregar etapas.";
        setNotice(`Falha ao carregar etapas do fluxo: ${reason}`);
      }
    } finally {
      if (!silent) setLoadingFlowStages(false);
    }
  }

  async function loadInteractionDetail(conversationId: number) {
    const summary =
      interactionSummary.conversations.find((item) => item.conversationId === conversationId) || null;
    const skeleton = buildRecoveryInteractionSkeleton(
      summary,
      interactionDetailRef.current?.conversationId === conversationId
        ? interactionDetailRef.current
        : null,
    );
    if (skeleton) {
      setInteractionDetail(skeleton);
    }
    setInteractionDetailError(null);
    setLoadingInteractionDetailId(conversationId);
    try {
      let payload: RecoveryInteractionDetail;
      try {
        payload = await apiFetch<RecoveryInteractionDetail>(
          `/hbx-recovery/interactions/${conversationId}/messages`,
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Erro ao abrir conversa";
        if (!/fora da carteira|not found/i.test(reason)) {
          throw error;
        }
        const inboxPayload = await apiFetch<RecoveryInboxFallbackConversation>(
          `/inbox/conversations/${conversationId}`,
        );
        payload = mapInboxConversationDetailToRecoveryDetail(inboxPayload);
      }
      const lastInbound = [...payload.messages]
        .reverse()
        .find((message) => String(message.direction || "").trim().toUpperCase() === "INBOUND");
      const previousInboundAt = interactionDetailLastInboundRef.current.get(conversationId);
      if (
        previousInboundAt &&
        lastInbound?.timestamp &&
        new Date(lastInbound.timestamp).getTime() > new Date(previousInboundAt).getTime()
      ) {
        setHumanAttentionPopup({
          conversationId: payload.conversationId,
          customerName: payload.customer.name,
          phone: getLiveInteractionPhone({
            conversationWhatsapp: payload.customer.conversationWhatsapp,
            customerWhatsapp: payload.customer.whatsappNumber,
          }),
          preview:
            String(lastInbound.body || "").trim() || "Nova mensagem aguardando resposta humana.",
          moduleLabel: "Recovery",
          attentionLabel: "Nova mensagem",
          kind: "new_message",
          lastAt: lastInbound.timestamp,
        });
      }
      if (lastInbound?.timestamp) {
        interactionDetailLastInboundRef.current.set(conversationId, lastInbound.timestamp);
      }
      // Only clear drafts when selecting a different conversation —
      // avoid wiping the operator's in-progress reply when the same
      // conversation is reloaded due to incoming events.
      const previousConversationId = interactionDetail?.conversationId;
      setInteractionDetail(payload);
      if (!previousConversationId || previousConversationId !== payload.conversationId) {
        setInteractionNoteDraft("");
        setInteractionReplyDraft("");
      }
      setInteractionDetailError(null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao abrir conversa";
      setInteractionDetailError(reason);
      setNotice(`Falha ao abrir conversa: ${reason}`);
    } finally {
      setLoadingInteractionDetailId(null);
    }
  }

  async function presentHumanAttentionPopup(
    item: RecoveryInteractionSummary["conversations"][number],
    kind: RecoveryHumanAttentionKind,
  ) {
    const phone = getLiveInteractionPhone({
      conversationWhatsapp: item.conversationWhatsapp,
      customerWhatsapp: item.customerWhatsapp,
    });
    const fallbackPreview =
      String(item.lastDirection || "").trim().toUpperCase() === "INBOUND" && item.lastMessage
        ? String(item.lastMessage).trim()
        : kind === "human_queue"
          ? "Cliente solicitou atendimento humano."
          : "Nova mensagem aguardando resposta humana.";

    let preview = fallbackPreview;
    const requestId = ++humanAttentionRequestRef.current;

    try {
      if (interactionDetail?.conversationId === item.conversationId) {
        preview = getLatestInboundPreview(interactionDetail.messages) || fallbackPreview;
      } else {
        const detail = await apiFetch<RecoveryInteractionDetail>(
          `/hbx-recovery/interactions/${item.conversationId}/messages`,
        );
        preview = getLatestInboundPreview(detail.messages) || fallbackPreview;
      }
    } catch {
      preview = fallbackPreview;
    }

    if (humanAttentionRequestRef.current !== requestId) {
      return;
    }

    const nextPopup = {
      conversationId: item.conversationId,
      customerName: item.customerName,
      phone,
      preview,
      moduleLabel: "Recovery",
      attentionLabel: kind === "human_queue" ? "Fila humana" : "Nova mensagem",
      kind,
      lastAt: item.lastAt,
    };

    const nextSignature = buildHumanAttentionSignature(nextPopup);
    if (dismissedHumanAttentionRef.current.get(item.conversationId) === nextSignature) {
      return;
    }

    setHumanAttentionPopup(nextPopup);
    upsertHumanAttentionFeedItem({
      id: `${item.conversationId}:${item.lastAt}:${kind}`,
      ...nextPopup,
    });
  }

  function openHumanAttentionConversation(conversationId: number) {
    dismissHumanAttention(conversationId);
    handleTabChange("messages");
    void loadInteractionDetail(conversationId);
  }

  async function refreshInteractionContext(conversationId: number) {
    await Promise.all([loadInteractions("all"), loadInteractionDetail(conversationId), reloadCustomers()]);
  }

  useEffect(() => {
    if (renderedTab !== "messages") return;
    const availableConversationIds = new Set(
      displayedInteractionConversations.map((conversation) => conversation.conversationId),
    );
    const currentConversationId = interactionDetail?.conversationId ?? null;

    if (currentConversationId && availableConversationIds.has(currentConversationId)) {
      return;
    }

    const nextConversationId = displayedInteractionConversations[0]?.conversationId;
    if (!nextConversationId) {
      if (currentConversationId) {
        setInteractionDetail(null);
      }
      return;
    }

    if (loadingInteractionDetailId === nextConversationId) return;
    void loadInteractionDetail(nextConversationId);
  }, [
    renderedTab,
    displayedInteractionConversations,
    interactionDetail?.conversationId,
    loadingInteractionDetailId,
  ]);

  async function runInteractionAction(
    conversationId: number,
    action:
      | "assign_human"
      | "pause_bot"
      | "resume_bot"
      | "generate_cash_link"
      | "generate_credit_link"
      | "resend_link"
      | "request_proof"
      | "mark_paid"
      | "reopen_interaction"
      | "block_interaction"
      | "unblock_interaction"
      | "close_interaction",
  ) {
    setInteractionActionBusy(`${conversationId}:${action}`);
    try {
      if (action === "assign_human") {
        await apiFetch(`/hbx-recovery/interactions/${conversationId}/assign-human`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });
      } else if (action === "pause_bot") {
        await apiFetch(`/hbx-recovery/interactions/${conversationId}/pause-bot`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });
      } else if (action === "resume_bot") {
        await apiFetch(`/hbx-recovery/interactions/${conversationId}/resume-bot`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });
      } else if (action === "generate_cash_link") {
        await apiFetch(`/hbx-recovery/interactions/${conversationId}/generate-link`, {
          method: "POST",
          body: JSON.stringify({ mode: "avista" }),
        });
      } else if (action === "generate_credit_link") {
        await apiFetch(`/hbx-recovery/interactions/${conversationId}/generate-link`, {
          method: "POST",
          body: JSON.stringify({ mode: "credito" }),
        });
      } else if (action === "resend_link") {
        await apiFetch(`/hbx-recovery/interactions/${conversationId}/resend-link`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      } else if (action === "request_proof") {
        await apiFetch(`/hbx-recovery/interactions/${conversationId}/request-proof`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      } else if (action === "mark_paid") {
        await apiFetch(`/hbx-recovery/interactions/${conversationId}/mark-paid`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });
      } else if (action === "reopen_interaction") {
        await apiFetch(`/hbx-recovery/interactions/${conversationId}/reopen`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });
      } else if (action === "block_interaction") {
        await apiFetch(`/hbx-recovery/interactions/${conversationId}/block`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });
      } else if (action === "unblock_interaction") {
        await apiFetch(`/hbx-recovery/interactions/${conversationId}/unblock`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });
      } else if (action === "close_interaction") {
        await apiFetch(`/hbx-recovery/interactions/${conversationId}/close`, {
          method: "PATCH",
          body: JSON.stringify({ result: "encerrado_operador" }),
        });
      }

      await refreshInteractionContext(conversationId);
      if (
        action === "close_interaction" ||
        action === "block_interaction" ||
        action === "unblock_interaction" ||
        action === "reopen_interaction"
      ) {
        dismissHumanAttention(conversationId);
      }
      setNotice("Acao executada com sucesso na conversa selecionada.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao executar acao";
      setNotice(`Falha na acao da conversa: ${reason}`);
    } finally {
      setInteractionActionBusy(null);
    }
  }

  async function saveInteractionInternalNote(conversationId: number) {
    const note = interactionNoteDraft.trim();
    if (note.length < 2) {
      setNotice("A nota interna precisa ter pelo menos 2 caracteres.");
      return;
    }
    setInteractionActionBusy(`${conversationId}:internal_note`);
    try {
      await apiFetch(`/hbx-recovery/interactions/${conversationId}/internal-note`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      setInteractionNoteDraft("");
      await refreshInteractionContext(conversationId);
      setNotice("Nota interna registrada no historico da conversa.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao salvar nota interna";
      setNotice(`Falha ao salvar nota interna: ${reason}`);
    } finally {
      setInteractionActionBusy(null);
    }
  }

  async function sendInteractionReply(conversationId: number) {
    const body = interactionReplyDraft.trim();
    if (!body) {
      setNotice("Digite uma mensagem para enviar ao cliente.");
      return;
    }
    setInteractionActionBusy(`${conversationId}:send_message`);
    try {
      await apiFetch(`/hbx-recovery/interactions/${conversationId}/send-message`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setInteractionReplyDraft("");
      dismissHumanAttention(conversationId);
      await refreshInteractionContext(conversationId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao enviar mensagem";
      setNotice(`Falha ao enviar mensagem ao cliente: ${reason}`);
    } finally {
      setInteractionActionBusy(null);
    }
  }

  useEffect(() => {
    if (hasToken === false) return;
    if (activeTab === "payments") {
      loadPaymentHistory(paymentMonth, paymentFilter);
    }
    if (activeTab === "messages") {
      loadInteractions("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab,
    paymentMonth,
    paymentFilter,
    hasToken,
  ]);

  function renderTemplateComposerWindow() {
    return (
      <article
        ref={templateComposerWindowRef}
        className={`${styles.botStepCard} ${styles.templateWorkspaceCard} ${styles.templateWindowDeckCard} ${styles.templateWindowResizable}`}
        style={templateWindowStyleById.composer}
      >
        <div className={styles.botStepHeader}>
          <div>
            <h4>Criar template na Meta</h4>
            <p>Monte, valide e envie com o grip unificado do HBX.</p>
          </div>
          {renderTemplateWindowOrganizerGrip("composer")}
        </div>

        <div
          ref={templateComposerLayoutRef}
          className={`${styles.templateComposerLayout} ${
            activeRecoveryLayout.templates.composerMode === "column"
              ? styles.templateComposerLayoutStacked
              : ""
          }`}
          style={templateComposerLayoutStyle}
        >
          <div className={styles.templateComposerForm}>
            <div className={styles.templateMetaHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Modo Meta</p>
                <h5>Conteudos do modelo</h5>
              </div>
              <div className={styles.templateMetaHeaderPills}>
                <span className={styles.templateMetaPill}>Idioma fixo: pt_BR</span>
                <span className={styles.templateMetaPill}>
                  Variavel no editor: {templateComposer.variableMode === "NAME" ? "Nome" : "Numero"}
                </span>
              </div>
            </div>

            <div className={styles.templateMetaTopGrid}>
              <label className={styles.fieldBlock}>
                <span>Nome interno</span>
                <input
                  className="field"
                  placeholder="ex: cobranca_inicial_hbx_v2"
                  value={templateComposer.name}
                  onChange={(event) =>
                    updateTemplateComposer((current) => ({ ...current, name: event.target.value }))
                  }
                />
                <small className={styles.templateFieldMeta}>
                  Vai para a Meta como <code>{normalizedComposerName || "nome_do_template"}</code>
                </small>
              </label>
              <label className={styles.fieldBlock}>
                <span>Categoria</span>
                <select
                  className="field"
                  value={templateComposer.category}
                  onChange={(event) =>
                    updateTemplateComposer((current) => ({
                      ...current,
                      category: event.target.value as RecoveryTemplateComposer["category"],
                    }))
                  }
                >
                  <option value="UTILITY">UTILITY</option>
                  <option value="MARKETING">MARKETING</option>
                  <option value="AUTHENTICATION">AUTHENTICATION</option>
                </select>
              </label>
              <label className={styles.fieldBlock}>
                <span>Tipo de variavel</span>
                <select
                  className="field"
                  value={templateComposer.variableMode}
                  onChange={(event) =>
                    updateTemplateComposer((current) => ({
                      ...current,
                      variableMode: event.target.value as RecoveryTemplateComposer["variableMode"],
                      enforceRecoveryVars:
                        event.target.value === "NAME" ? current.enforceRecoveryVars : false,
                    }))
                  }
                >
                  <option value="NAME">Nome</option>
                  <option value="NUMBER">Numero</option>
                </select>
                <small className={styles.templateFieldMeta}>
                  {templateComposer.variableMode === "NAME"
                    ? "Use {{empresa}}, {{funcionario}} e {{cliente}}."
                    : "Use {{1}}, {{2}} e {{3}}."}
                </small>
              </label>
              <label className={styles.fieldBlock}>
                <span>Logo / cabecalho</span>
                <select
                  className="field"
                  value={templateComposer.headerFormat}
                  onChange={(event) =>
                    updateTemplateComposer((current) => ({
                      ...current,
                      headerFormat: event.target.value as RecoveryTemplateComposer["headerFormat"],
                    }))
                  }
                >
                  <option value="NONE">Sem cabecalho</option>
                  <option value="TEXT">Texto</option>
                  <option value="IMAGE">Imagem / logotipo</option>
                  <option value="DOCUMENT">Documento</option>
                  <option value="VIDEO">Video</option>
                </select>
              </label>
            </div>

            <div className={styles.templateMetaComplianceCard}>
              <div className={styles.templateMetaComplianceHeader}>
                <strong>Checklist Meta em tempo real</strong>
              </div>
              <div className={styles.templateMetaComplianceGrid}>
                {composerComplianceRows.map((item) => (
                  <div
                    key={item.label}
                    className={`${styles.templateMetaComplianceItem} ${
                      item.state === "ok"
                        ? styles.templateMetaComplianceItemOk
                        : styles.templateMetaComplianceItemError
                    }`}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                ))}
              </div>
            </div>

            {templateComposer.headerFormat === "TEXT" ? (
              <label className={styles.fieldBlock}>
                <span>Texto do cabecalho</span>
                <input
                  className="field"
                  placeholder="ex: Recovery"
                  value={templateComposer.headerText}
                  onChange={(event) =>
                    updateTemplateComposer((current) => ({
                      ...current,
                      headerText: event.target.value,
                    }))
                  }
                />
                <small className={styles.templateFieldMeta}>
                  Ate 60 caracteres e sem variaveis.
                </small>
              </label>
            ) : null}

            {templateComposer.headerFormat === "IMAGE" ||
            templateComposer.headerFormat === "DOCUMENT" ||
            templateComposer.headerFormat === "VIDEO" ? (
              <>
                {templateComposer.headerFormat === "IMAGE" ? (
                  <>
                    <input
                      ref={templateHeaderFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className={styles.templateHiddenInput}
                      onChange={onTemplateHeaderFileChange}
                    />
                    <button
                      type="button"
                      className={`${styles.templateUploadZone} ${
                        templateHeaderDropActive ? styles.templateUploadZoneActive : ""
                      }`}
                      onClick={() => templateHeaderFileInputRef.current?.click()}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setTemplateHeaderDropActive(true);
                      }}
                      onDragLeave={() => setTemplateHeaderDropActive(false)}
                      onDrop={onTemplateHeaderDrop}
                      disabled={metaTemplateBusy === "upload-header"}
                    >
                      <strong>
                        {metaTemplateBusy === "upload-header"
                          ? "Enviando imagem..."
                          : "Arraste a imagem aqui ou clique para enviar"}
                      </strong>
                      <span>
                        JPG, PNG ou WEBP ate 25 MB. O HBX converte para JPG compativel, em
                        1080x1080, com logo central de ate 500x500.
                      </span>
                    </button>
                    {templateComposer.headerMediaUrl ? (
                      <div className={styles.templateUploadPreview}>
                        <img src={templateComposer.headerMediaUrl} alt="Preview do cabecalho" />
                        <div>
                          <strong>Preview</strong>
                          <p>A mesma URL sera usada pelo HBX no envio do template.</p>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div className={styles.registerInlineFields}>
                  <label className={styles.fieldBlock}>
                    <span>Handle Meta</span>
                    <input
                      className="field"
                      placeholder="ex: 4::YX..."
                      value={templateComposer.headerHandle}
                      onChange={(event) =>
                        updateTemplateComposer((current) => ({
                          ...current,
                          headerHandle: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className={styles.fieldBlock}>
                    <span>URL da imagem</span>
                    <input
                      className="field"
                      placeholder="https://..."
                      value={templateComposer.headerMediaUrl}
                      onChange={(event) =>
                        updateTemplateComposer((current) => ({
                          ...current,
                          headerMediaUrl: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className={styles.templateHelperCard}>
                  <strong>Como funciona agora</strong>
                  {templateComposer.headerFormat === "IMAGE" ? (
                    <>
                      <p>1. Envie a imagem aqui pelo HBX.</p>
                      <p>2. O sistema preenche o <code>header_handle</code> e a URL automaticamente.</p>
                      <p>3. O logo sera centralizado em 1080x1080, com area segura menor para evitar corte.</p>
                      <p>4. Prefira simbolo + nome. Textos pequenos no logo tendem a sumir no chat.</p>
                    </>
                  ) : (
                    <>
                      <p>1. Envie o arquivo correspondente na Meta.</p>
                      <p>2. Cole aqui o <code>header_handle</code>.</p>
                      <p>3. Informe a URL publica usada pelo HBX no envio.</p>
                    </>
                  )}
                </div>
              </>
            ) : null}

            <label className={styles.fieldBlock}>
              <span>Mensagem (BODY)</span>
              <textarea
                className="field"
                value={templateComposer.bodyText}
                onChange={(event) =>
                  updateTemplateComposer((current) => ({ ...current, bodyText: event.target.value }))
                }
              />
            </label>
            <label className={styles.fieldBlock}>
              <span>Rodape (opcional)</span>
              <input
                className="field"
                value={templateComposer.footerText}
                onChange={(event) =>
                  updateTemplateComposer((current) => ({ ...current, footerText: event.target.value }))
                }
              />
            </label>
            <label className={styles.fieldBlock}>
              <span>Botoes rapidos (1 por linha, max 3)</span>
              <textarea
                className="field"
                value={templateComposer.buttonsText}
                onChange={(event) =>
                  updateTemplateComposer((current) => ({ ...current, buttonsText: event.target.value }))
                }
              />
            </label>

            <div className={styles.interactionBadgeRow}>
              {composerVariables.map((variable) => (
                <span key={`composer-var-${variable}`} className={`${styles.stateBadge} ${styles.stateWaiting}`}>
                  {`{{${variable}}}`}
                </span>
              ))}
            </div>

            {composerOrderedVariables.length > 0 ? (
              <div className={styles.templateVariableGuide}>
                <div className={styles.templateVariableGuideHeader}>
                  <div className={styles.templateVariableGuideHeaderRow}>
                    <strong>Parametros detectados no body</strong>
                    <span className={`${styles.stateBadge} ${styles.stateBot}`}>
                      {`${composerOrderedVariables.length} parametro${composerOrderedVariables.length > 1 ? "s" : ""}`}
                    </span>
                  </div>
                  <p>
                    A Meta transforma cada placeholder em um parametro numerado. Defina abaixo o
                    exemplo que vai junto para aprovacao.
                  </p>
                </div>
                <div className={styles.templateVariableGuideGrid}>
                  {composerOrderedVariables.map((variable, index) => {
                    const normalizedKey = normalizeTemplateVariableKey(variable);
                    return (
                      <div key={`composer-variable-guide-${normalizedKey}`} className={styles.templateVariableGuideRow}>
                        <div className={styles.templateVariableGuideMeta}>
                          <span className={`${styles.stateBadge} ${styles.stateWaiting}`}>
                            {`{{${variable}}}`}
                          </span>
                          <span className={`${styles.stateBadge} ${styles.stateBot}`}>
                            {`Parametro {{${index + 1}}}`}
                          </span>
                        </div>
                        <label className={styles.fieldBlock}>
                          <span>Exemplo enviado para a Meta</span>
                          <input
                            className="field"
                            value={composerVariableExamples[normalizedKey] || ""}
                            onChange={(event) =>
                              updateTemplateComposerVariableExample(variable, event.target.value)
                            }
                          />
                          <small className={styles.templateFieldMeta}>
                            Esse valor entra como sample no pedido de aprovacao do template.
                          </small>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {composerVariableMap.length > 0 ? (
              <div className={styles.templateVariableMap}>
                <strong>
                  {templateComposer.variableMode === "NAME"
                    ? "Como a Meta vai numerar os parametros"
                    : "Parametros detectados no body"}
                </strong>
                <div className={styles.templateVariableMapGrid}>
                  {composerVariableMap.map((item) => (
                    <span key={`${item.friendly}-${item.meta}`} className={styles.templateVariableMapItem}>
                      {templateComposer.variableMode === "NAME"
                        ? `${item.friendly} -> ${item.meta}`
                        : `Parametro ${item.meta}`}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={styles.interactionBadgeRow}>
              <label className={styles.inlineToggle}>
                <input
                  type="checkbox"
                  checked={templateComposer.activateInHbx}
                  onChange={(event) =>
                    updateTemplateComposer((current) => ({
                      ...current,
                      activateInHbx: event.target.checked,
                    }))
                  }
                />
                Ativar no HBX apos criar
              </label>
              <label className={styles.inlineToggle}>
                <input
                  type="checkbox"
                  checked={templateComposer.enforceRecoveryVars}
                  disabled={templateComposer.variableMode !== "NAME"}
                  onChange={(event) =>
                    updateTemplateComposer((current) => ({
                      ...current,
                      enforceRecoveryVars: event.target.checked,
                    }))
                  }
                />
                Aplicar validacoes extras do Recovery
              </label>
            </div>

            {templateComposer.enforceRecoveryVars && missingRecoveryVars.length > 0 ? (
              <div className="alert alert-error">
                Variaveis faltando para template inicial:{" "}
                {missingRecoveryVars.map((item) => `{{${item}}}`).join(", ")}
              </div>
            ) : null}
            {composerBlockingIssues.length > 0 ? (
              <div className={styles.templateMetaIssueList}>
                {composerBlockingIssues.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            ) : null}
            {templateComposerError ? (
              <div className="alert alert-error">{templateComposerError}</div>
            ) : null}

            <div className={styles.heroActions}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={createMetaTemplate}
                disabled={metaTemplateBusy === "create" || !normalizedComposerName || composerBlockingIssues.length > 0}
              >
                {metaTemplateBusy === "create" ? "Criando..." : "Criar template na Meta"}
              </button>
            </div>
          </div>

          {activeRecoveryLayout.templates.composerMode === "row" ? (
            <div
              role="separator"
              aria-orientation="vertical"
              className={styles.templateComposerSplitter}
              onPointerDown={(event) =>
                beginLayoutResize("composer", "row", templateComposerLayoutRef.current, event)
              }
            />
          ) : null}
        </div>
        <div
          role="separator"
          aria-orientation="horizontal"
          className={styles.templateCatalogResizeHandle}
          onPointerDown={(event) =>
            beginLayoutResize("composerCard", "column", templateComposerLayoutRef.current, event)
          }
        >
          <span />
        </div>
        {renderTemplateWindowResizeHandles("composer")}
      </article>
    );
  }

  function renderTemplateCatalogWindow() {
    return (
      <article
        ref={templateCatalogWindowRef}
        className={`${styles.botStepCard} ${styles.templateWorkspaceCard} ${styles.templateWindowDeckCard} ${styles.templateWindowResizable}`}
        style={templateWindowStyleById.catalog}
      >
        <div className={styles.botStepHeader}>
          <div>
            <h4>Catalogo PT-BR</h4>
            <p>Gerencie os templates ativos sem cortar a lista.</p>
          </div>
          {renderTemplateWindowOrganizerGrip("catalog")}
        </div>

        {loadingMetaTemplates ? (
          <div className={styles.flowEmpty}>Carregando templates...</div>
        ) : metaTemplates.templates.length === 0 ? (
          <div className={styles.flowEmpty}>
            Nenhum template encontrado. Clique em sincronizar para consultar a Meta.
          </div>
        ) : (
          <>
            <div ref={templateCatalogListRef} className={styles.templateCatalogList}>
              {metaTemplates.templates.map((template) => {
                const view = getTemplateViewModel(template);
                return (
                <article key={`${template.name}-${template.language}`} className={styles.templateCatalogItem}>
                  <div className={styles.templateCatalogHeader}>
                    <div>
                      <strong>{template.name}</strong>
                      <p>
                        {template.category} - {template.language}
                      </p>
                    </div>
                    <div className={styles.interactionBadgeRow}>
                      <span className={`${styles.stateBadge} ${getMetaStatusBadgeClass(template.status)}`}>
                        Meta: {metaStatusLabel(template.status)}
                      </span>
                      <span
                        className={`${styles.stateBadge} ${
                          template.hbxActive ? styles.statePaid : styles.stateExpired
                        }`}
                      >
                        HBX: {template.hbxActive ? "Ativo" : "Inativo"}
                      </span>
                      <span className={`${styles.stateBadge} ${styles.stateWaiting}`}>
                        {headerFormatLabel(view.headerFormat)}
                      </span>
                    </div>
                  </div>
                  {view.headerText ? (
                    <p className={styles.templateCatalogMeta}>Cabecalho: {view.headerText}</p>
                  ) : null}
                  {isMediaHeaderFormat(view.headerFormat) ? (
                    <div className={styles.templateCatalogInlineField}>
                      <label className={styles.fieldBlock}>
                        <span>URL da imagem</span>
                        <input
                          className="field"
                          placeholder="https://..."
                          value={view.headerMediaUrl || ""}
                          onChange={(event) =>
                            updateTemplateHeaderMediaUrl(
                              template.name,
                              template.language,
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <div className={styles.heroActions}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => saveTemplateHeaderMediaUrl(template.name, template.language)}
                          disabled={metaTemplateBusy === `config:${template.name}:${template.language}`}
                        >
                          {metaTemplateBusy === `config:${template.name}:${template.language}`
                            ? "Salvando..."
                            : "Salvar URL"}
                        </button>
                      </div>
                      {!String(view.headerMediaUrl || "").trim() ? (
                        <div className="alert alert-error">
                          Informe a URL publica da imagem para o HBX conseguir enviar.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <p className={styles.templateCatalogText}>
                    {view.bodyText || "Sem body retornado pela Meta."}
                  </p>
                  {view.footerText ? (
                    <p className={styles.templateCatalogMeta}>Rodape: {view.footerText}</p>
                  ) : null}
                  {view.buttons.length > 0 ? (
                    <div className={styles.interactionBadgeRow}>
                      {view.buttons.map((button, index) => (
                        <span
                          key={`${template.name}-${template.language}-${button.type}-${index}`}
                          className={`${styles.stateBadge} ${styles.stateBot}`}
                        >
                          {button.text || button.type}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className={styles.interactionBadgeRow}>
                    {view.variableOrder.map((variable) => (
                      <span
                        key={`${template.name}-${template.language}-var-${variable}`}
                        className={`${styles.stateBadge} ${styles.stateWaiting}`}
                      >
                        {`{{${variable}}}`}
                      </span>
                    ))}
                  </div>
                  {Object.keys(view.variableExamples).length > 0 ? (
                    <div className={styles.interactionBadgeRow}>
                      {Object.entries(view.variableExamples).map(([variable, example]) => (
                        <span
                          key={`${template.name}-${template.language}-example-${variable}`}
                          className={`${styles.stateBadge} ${styles.stateWaiting}`}
                        >
                          {`{{${variable}}}: ${example}`}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {template.rejectedReason ? (
                    <div className="alert alert-error">Motivo Meta: {template.rejectedReason}</div>
                  ) : null}
                  <div className={`${styles.heroActions} ${styles.templateActionRow}`}>
                    <button
                      type="button"
                      className={`btn btn-sm ${template.hbxActive ? "btn-danger" : "btn-secondary"}`}
                      onClick={() =>
                        toggleTemplateHbxActivation(
                          template.name,
                          template.language,
                          !template.hbxActive,
                        )
                      }
                      disabled={metaTemplateBusy === `toggle:${template.name}:${template.language}`}
                    >
                      {template.hbxActive ? "Desativar no HBX" : "Ativar no HBX"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const variableMode = inferTemplateVariableMode(
                          view.variableOrder.length > 0
                            ? view.variableOrder
                            : extractTemplateVariablesInOrder(view.bodyText || ""),
                        );
                        setTemplateComposer({
                          ...DEFAULT_TEMPLATE_COMPOSER,
                          name: template.name,
                          category:
                            template.category === "MARKETING" ||
                            template.category === "AUTHENTICATION"
                              ? (template.category as RecoveryTemplateComposer["category"])
                              : "UTILITY",
                          language: template.language || "pt_BR",
                          variableMode,
                          headerFormat: view.headerFormat,
                          headerText: view.headerText || "",
                          headerHandle: view.headerHandle || "",
                          headerMediaUrl: view.headerMediaUrl || "",
                          bodyText: view.bodyText || DEFAULT_TEMPLATE_COMPOSER.bodyText,
                          footerText: view.footerText || "",
                          buttonsText: view.buttons
                            .map((button) => String(button.text || "").trim())
                            .filter((button) => button.length > 0)
                            .join("\n"),
                          variableExamples: {},
                          activateInHbx: true,
                          enforceRecoveryVars: false,
                        });
                        setTemplateComposerPreviewVisible(true);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => deleteMetaTemplate(template)}
                      disabled={metaTemplateBusy === `delete:${template.name}:${template.language}`}
                    >
                      {metaTemplateBusy === `delete:${template.name}:${template.language}`
                        ? "Excluindo..."
                        : "Excluir"}
                    </button>
                  </div>
                </article>
              );})}
            </div>
            <div
              role="separator"
              aria-orientation="horizontal"
              className={styles.templateCatalogResizeHandle}
              onPointerDown={(event) =>
                beginLayoutResize("catalog", "column", templateCatalogListRef.current, event)
              }
            >
              <span />
            </div>
          </>
        )}
        {renderTemplateWindowResizeHandles("catalog")}
      </article>
    );
  }

  function renderTemplateHistoryWindow() {
    return (
      <article
        ref={templateHistoryWindowRef}
        className={`${styles.botStepCard} ${styles.templateWindowDeckCard} ${styles.templateWindowResizable}`}
        style={templateWindowStyleById.history}
      >
        <div className={styles.botStepHeader}>
          <div>
            <h4>Historico de aprovacao/reprovacao</h4>
            <p>Auditoria das mudancas de status recebidas da Meta na sincronizacao.</p>
          </div>
          {renderTemplateWindowOrganizerGrip("history")}
        </div>
        {metaTemplates.history.length === 0 ? (
          <div className={styles.flowEmpty}>Sem mudancas de status registradas ate agora.</div>
        ) : (
          <div className={styles.templateHistoryList}>
            {metaTemplates.history.slice(0, 30).map((item) => (
              <div key={item.id} className={styles.templateHistoryRow}>
                <strong>
                  {item.name} ({item.language})
                </strong>
                <span>
                  {item.previousStatus || "Sem status anterior"} {"->"} {item.nextStatus}
                </span>
                <span>{formatDateTime(item.changedAt)}</span>
                {item.reason ? <span>Motivo: {item.reason}</span> : null}
              </div>
            ))}
          </div>
        )}
        {renderTemplateWindowResizeHandles("history")}
      </article>
    );
  }

  function renderTemplatePreviewWindow() {
    return (
      <article
        ref={templatePreviewWindowRef}
        className={`${styles.templatePreviewPanel} ${styles.templatePreviewPopup} ${styles.tabTransitionStage} ${
          templatePreviewTransitionStage === "exit"
            ? styles.tabTransitionExit
            : templatePreviewTransitionStage === "enter"
              ? styles.tabTransitionEnter
              : ""
        }`}
        style={templateWindowStyleById.preview}
      >
        <div className={`${styles.templatePreviewHeader} ${styles.templatePreviewWindowHeader}`}>
          <div>
            <span className={styles.templatePreviewEyebrow}>Preview ao vivo</span>
            <strong>Como a mensagem tende a aparecer</strong>
          </div>
          <div className={styles.templatePreviewHeaderActions}>
            <span className={`${styles.stateBadge} ${styles.stateWaiting}`}>
              {previewComposer.language || "pt_BR"}
            </span>
            <button
              type="button"
              className={styles.templatePreviewCloseButton}
              onClick={() => setTemplateComposerPreviewVisible((current) => !current)}
              aria-label="Alternar preview"
            >
              {templateComposerPreviewVisible ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>

        <div className={styles.templatePhoneFrame}>
          <div className={styles.templatePhoneTopBar}>
            <span>WhatsApp</span>
            <strong>{previewComposer.name || "novo_template_meta"}</strong>
          </div>
          <div className={styles.templateChatCanvas}>
            <div className={styles.templateMessageBubble}>
              {previewComposer.headerFormat === "IMAGE" ? (
                previewComposer.headerMediaUrl ? (
                  <img
                    className={styles.templateMessageMedia}
                    src={previewComposer.headerMediaUrl}
                    alt="Cabecalho visual do template"
                  />
                ) : (
                  <div className={styles.templateMessageMediaPlaceholder}>
                    <strong>Logotipo / imagem</strong>
                    <span>Envie a arte para visualizar aqui</span>
                  </div>
                )
              ) : null}
              {previewComposer.headerFormat === "DOCUMENT" ? (
                <div className={styles.templateAttachmentCard}>
                  <strong>Documento do cabecalho</strong>
                  <span>O cliente vera um anexo antes da mensagem.</span>
                </div>
              ) : null}
              {previewComposer.headerFormat === "VIDEO" ? (
                <div className={styles.templateAttachmentCard}>
                  <strong>Video do cabecalho</strong>
                  <span>O template exibira um video no topo.</span>
                </div>
              ) : null}
              {previewComposer.headerFormat === "TEXT" && previewHeaderText ? (
                <div className={styles.templateMessageHeaderText}>{previewHeaderText}</div>
              ) : null}

              <div className={styles.templateMessageBody}>{previewBodyText}</div>
              {previewFooterText ? (
                <div className={styles.templateMessageFooter}>{previewFooterText}</div>
              ) : null}

              {composerPreviewButtons.length > 0 ? (
                <div className={styles.templateMessageButtons}>
                  {composerPreviewButtons.map((button) => (
                    <button
                      key={`preview-popup-button-${button}`}
                      type="button"
                      className={styles.templateMessageButton}
                      disabled
                    >
                      {button}
                    </button>
                  ))}
                </div>
              ) : null}

              <span className={styles.templateMessageTime}>{previewTimeLabel}</span>
            </div>
          </div>
        </div>

        <div className={styles.templatePreviewLegend}>
          <strong>Variaveis usadas no preview</strong>
          <div className={styles.templatePreviewVariables}>
            {composerVariables.length > 0 ? (
              composerVariables.map((variable) => (
                <span key={`preview-popup-var-${variable}`} className={styles.templatePreviewVariable}>
                  {`{{${variable}}}`} ={" "}
                  {previewTemplateSamples[variable] || `[${variable.toUpperCase()}]`}
                </span>
              ))
            ) : (
              <span className={styles.templatePreviewVariable}>Sem variaveis detectadas no body.</span>
            )}
          </div>
        </div>
        {renderTemplateWindowResizeHandles("preview")}
      </article>
    );
  }

  function renderTemplateWindowCard(id: TemplateWindowId) {
    if (id === "composer") return renderTemplateComposerWindow();
    if (id === "catalog") return renderTemplateCatalogWindow();
    if (id === "history") return renderTemplateHistoryWindow();
    return renderTemplatePreviewWindow();
  }

  let selectedCustomer: CustomerRow | null = null;

  for (const customer of customers) {
    if (customer.id === drawerCustomerId) {
      selectedCustomer = customer;
    }
  }

  const visibleInteractionMessages = useMemo(() => {
    const base = interactionDetail?.messages || [];
    if (showSystemMessages) return base;
    return base.filter((message) => {
      const messageType = String(message.messageType || "").trim().toLowerCase();
      return messageType !== "system_event";
    });
  }, [interactionDetail?.messages, showSystemMessages]);

  const interactionMessageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!interactionDetail) return;
    const container = interactionMessageListRef.current;
    if (!container) return;

    // Always scroll to the most recent message when opening the conversation.
    // Use requestAnimationFrame + setTimeout to ensure DOM is painted before forcing scroll.
    try {
      const doScroll = () => {
        try {
          // instant scroll to bottom to avoid large smooth-scroll delays on very long histories
          container.scrollTop = container.scrollHeight;
        } catch (e) {
          // best-effort: fall back to scrollIntoView of last child
          const last = container.lastElementChild as HTMLElement | null;
          if (last) last.scrollIntoView(false);
        }
      };

      // run on next paint, and again shortly after to handle late-rendered content
      requestAnimationFrame(() => {
        doScroll();
        window.setTimeout(doScroll, 100);
      });
    } catch (err) {
      // ignore
    }
  }, [interactionDetail?.conversationId, visibleInteractionMessages.length]);

  useEffect(() => {
    if (requestedTab === activeTab) return;
    setActiveTab(requestedTab);
    setRenderedTab(requestedTab);
    setTabTransitionStage("idle");

    if (requestedTab === "templates") {
      loadMetaTemplates(false).catch(() => undefined);
    }
    if (requestedTab === "bot") {
      loadFlowStages({ silent: false }).catch(() => undefined);
    }
    if (requestedTab !== "messages") {
      setInteractionDetail(null);
      setInteractionNoteDraft("");
    }
  }, [activeTab, requestedTab]);

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

  function openCustomer(customerId: string) {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setDrawerCustomerId(customerId);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      setDrawerCustomerId(null);
      closeTimerRef.current = null;
    }, 260);
  }

  function handleRowKeyDown(
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    customerId: string,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openCustomer(customerId);
  }

  function handleBotTextChange(
    field:
      | "rootFooter"
      | "mainMenuPrompt"
      | "declineMenuPrompt"
      | "followupPrompt"
      | "valueMessageTemplate"
      | "installmentsPrompt"
      | "installmentConfirmTemplate"
      | "cashLinkMessageTemplate"
      | "installmentLinkMessageTemplate"
      | "postLinkPrompt"
      | "closeTopicMessage"
      | "paidClaimMessage"
      | "humanAckMessage",
    value: string,
  ) {
    setBotConfig((current) =>
      ensureBotConfigShape({
        ...current,
        [field]: value,
      }),
    );
  }

  function appendVariableToTextField(
    field:
      | "mainMenuPrompt"
      | "declineMenuPrompt"
      | "followupPrompt"
      | "valueMessageTemplate"
      | "installmentsPrompt"
      | "installmentConfirmTemplate"
      | "cashLinkMessageTemplate"
      | "installmentLinkMessageTemplate"
      | "postLinkPrompt"
      | "closeTopicMessage"
      | "paidClaimMessage"
      | "humanAckMessage"
      | "rootFooter",
    variableKey: string,
  ) {
    setBotConfig((current) =>
      ensureBotConfigShape({
        ...current,
        [field]: `${String(current[field] || "")} {{${variableKey}}}`.trim(),
      }),
    );
  }

  function setActiveStartTemplate(name: string, language: string) {
    setBotConfig((current) => {
      const selectedKey = `${String(name || "").trim().toLowerCase()}::${String(
        language || "pt_BR",
      )
        .trim()
        .toLowerCase()}`;
      return ensureBotConfigShape({
        ...current,
        startTemplates: botEditorStartTemplates.map((template) => ({
          ...template,
          active:
            `${String(template.name || "").trim().toLowerCase()}::${String(
              template.language || "pt_BR",
            )
              .trim()
              .toLowerCase()}` === selectedKey,
        })),
      });
    });
  }

  function handleSectionButtonChange(
    section: BotButtonSectionKey,
    buttonIndex: number,
    field: "buttonId" | "actionId" | "title" | "nextNodeId",
    value: string,
  ) {
    setBotConfig((current) => {
      const currentButtons = [...(current[section] as RecoveryBotButton[])];
      if (!currentButtons[buttonIndex]) return current;
      const currentActionId =
        field === "actionId" ? String(value || "") : String(currentButtons[buttonIndex]?.actionId || "");
      currentButtons[buttonIndex] = {
        ...currentButtons[buttonIndex],
        [field]:
          field === "actionId"
            ? (value as RecoveryBotActionId)
            : field === "buttonId"
              ? normalizeRecoveryButtonId(
                  value,
                  buildRecoveryButtonId(section, String(currentButtons[buttonIndex]?.actionId || ""), buttonIndex),
                )
              : field === "nextNodeId"
                ? normalizeRecoveryNextNodeId(value, currentActionId)
              : value,
        nextNodeId:
          field === "actionId"
            ? resolveRecoveryButtonNextNodeId(value)
            : field === "nextNodeId"
              ? normalizeRecoveryNextNodeId(value, currentActionId)
              : normalizeRecoveryNextNodeId(String(currentButtons[buttonIndex]?.nextNodeId || ""), currentActionId),
      };
      return ensureBotConfigShape({
        ...current,
        [section]: currentButtons,
      });
    });
  }

  function addSectionButton(section: BotButtonSectionKey) {
    setBotConfig((current) => {
      const currentButtons = [...(current[section] as RecoveryBotButton[])];
      currentButtons.push({
        buttonId: buildRecoveryButtonId(section, "talk_human", currentButtons.length),
        actionId: "talk_human",
        title: BOT_ACTION_LABELS.talk_human,
        nextNodeId: resolveRecoveryButtonNextNodeId("talk_human"),
      });
      return ensureBotConfigShape({
        ...current,
        [section]: currentButtons,
      });
    });
  }

  function removeSectionButton(section: BotButtonSectionKey, buttonIndex: number) {
    setBotConfig((current) => {
      const currentButtons = [...(current[section] as RecoveryBotButton[])];
      const nextButtons = currentButtons.filter((_, index) => index !== buttonIndex);
      return ensureBotConfigShape({
        ...current,
        [section]: nextButtons,
      });
    });
  }

  function handleVariableGuideChange(
    key: string,
    field: "label" | "example" | "description",
    value: string,
  ) {
    setBotConfig((current) =>
      ensureBotConfigShape({
        ...current,
        variableCatalog: current.variableCatalog.map((item) =>
          item.key === key
            ? {
                ...item,
                [field]: value,
              }
            : item,
        ),
      }),
    );
  }

  function addCustomActionGuide() {
    setBotConfig((current) => {
      const nextIndex = current.actionCatalog.filter((item) => item.custom).length + 1;
      const actionId = normalizeCustomActionId(`custom_action_${nextIndex}`);
      return ensureBotConfigShape({
        ...current,
        actionCatalog: [
          ...current.actionCatalog,
          {
            actionId,
            title: `Acao custom ${nextIndex}`,
            description: "Explique aqui o que essa acao precisa fazer.",
            route: "recovery",
            enabled: true,
            responseMessage: "Recebi sua solicitacao. Vou seguir com esse fluxo.",
            custom: true,
          },
        ],
      });
    });
  }

  function updateActionGuide(
    actionId: string,
    field: "actionId" | "title" | "description" | "route" | "responseMessage" | "enabled",
    value: string | boolean,
  ) {
    setBotConfig((current) =>
      ensureBotConfigShape({
        ...current,
        actionCatalog: current.actionCatalog.map((item) => {
          if (String(item.actionId) !== actionId) return item;
          if (field === "actionId") {
            return { ...item, actionId: normalizeCustomActionId(String(value)) || String(item.actionId) };
          }
          return { ...item, [field]: value };
        }),
      }),
    );
  }

  function removeCustomActionGuide(actionId: string) {
    setBotConfig((current) => {
      const next = ensureBotConfigShape({
        ...current,
        actionCatalog: current.actionCatalog.filter(
          (item) => !(item.custom && String(item.actionId) === actionId),
        ),
      });
      const buttonSections: BotButtonSectionKey[] = [
        "mainMenuButtons",
        "declineMenuButtons",
        "followupButtons",
        "valueButtons",
        "installmentButtons",
        "installmentConfirmButtons",
        "postLinkButtons",
      ];
      for (const section of buttonSections) {
        next[section] = next[section].filter((button) => String(button.actionId) !== actionId);
      }
      return ensureBotConfigShape(next);
    });
  }

  async function moveFlowStage(stageId: string, direction: "up" | "down") {
    const currentIndex = flowStages.findIndex((item) => item.id === stageId);
    if (currentIndex < 0) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= flowStages.length) return;
    const target = flowStages[targetIndex];
    setMovingFlowStageId(stageId);
    try {
      await apiFetch(`/hbx-recovery/flows/${stageId}`, {
        method: "PATCH",
        body: JSON.stringify({ sortOrder: target.sortOrder }),
      });
      await loadFlowStages({ silent: true });
      setNotice("Etapas do fluxo reordenadas.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Falha ao mover etapa.";
      setNotice(`Falha ao mover etapa: ${reason}`);
    } finally {
      setMovingFlowStageId(null);
    }
  }

  function updateFlowStageDraft(
    stageId: string,
    field: keyof RecoveryFlowStage,
    value: string | number | boolean,
  ) {
    setFlowStages((current) =>
      current.map((stage) =>
        stage.id === stageId
          ? {
              ...stage,
              [field]: value,
            }
          : stage,
      ),
    );
  }

  async function saveFlowStage(stageId: string) {
    const stage = flowStages.find((item) => item.id === stageId);
    if (!stage) return;
    setSavingFlowStageId(stageId);
    try {
      await apiFetch(`/hbx-recovery/flows/${stageId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: stage.title,
          channel: stage.channel,
          template: stage.template,
          daysAfter: Number(stage.daysAfter || 0),
          enabled: Boolean(stage.enabled),
        }),
      });
      await loadFlowStages({ silent: true });
      setNotice(`Etapa \"${stage.title}\" atualizada.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Falha ao salvar etapa.";
      setNotice(`Falha ao salvar etapa: ${reason}`);
    } finally {
      setSavingFlowStageId(null);
    }
  }

  async function createFlowStage() {
    setCreatingFlowStage(true);
    try {
      await apiFetch("/hbx-recovery/flows", {
        method: "POST",
        body: JSON.stringify({
          title: `Nova etapa ${flowStages.length + 1}`,
          channel: "whatsapp",
          template: "Defina o template operacional desta etapa.",
          daysAfter: flowStages.length + 1,
          enabled: true,
        }),
      });
      await loadFlowStages({ silent: true });
      setNotice("Nova etapa operacional criada.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Falha ao criar etapa.";
      setNotice(`Falha ao criar etapa: ${reason}`);
    } finally {
      setCreatingFlowStage(false);
    }
  }

  async function deleteFlowStage(stageId: string) {
    const stage = flowStages.find((item) => item.id === stageId);
    if (!stage) return;
    setDeletingFlowStageId(stageId);
    try {
      await apiFetch(`/hbx-recovery/flows/${stageId}`, {
        method: "DELETE",
      });
      await loadFlowStages({ silent: true });
      setNotice(`Etapa \"${stage.title}\" removida.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Falha ao remover etapa.";
      setNotice(`Falha ao remover etapa: ${reason}`);
    } finally {
      setDeletingFlowStageId(null);
    }
  }

  function handleRoutingRuleChange(
    field: keyof RecoveryBotConfig["routingRules"],
    checked: boolean,
  ) {
    setBotConfig((current) =>
      ensureBotConfigShape({
        ...current,
        routingRules: {
          ...current.routingRules,
          [field]: checked,
        },
      }),
    );
  }

  async function saveBotConfig() {
    if (botEditorStartTemplates.length === 0) {
      setNotice(
        "Nenhum template ativo no HBX e aprovado na Meta foi encontrado para o inicio do bot.",
      );
      return;
    }
    const selected =
      botConfig.startTemplates.find((item) => item.active && item.name) ||
      botEditorStartTemplates[0];
    const selectedTemplate = metaTemplates.templates.find(
      (item) =>
        item.name.toLowerCase() === selected.name.toLowerCase() &&
        item.language.toLowerCase() === selected.language.toLowerCase(),
    );
    if (!selectedTemplate) {
      setNotice(
        "Template inicial nao encontrado no catalogo da Meta. Sincronize templates e tente novamente.",
      );
      return;
    }
    const templateIssues = getRecoveryStartTemplateIssues(selectedTemplate);
    if (templateIssues.length > 0) {
      setNotice(`Template inicial incompativel com o bot: ${templateIssues.join("; ")}.`);
      return;
    }

    setSavingBotConfig(true);
    try {
      const activeKey = `${selected.name.toLowerCase()}::${selected.language.toLowerCase()}`;
      const startTemplates = botEditorStartTemplates.map((template) => ({
        ...template,
        active:
          `${template.name.toLowerCase()}::${template.language.toLowerCase()}` === activeKey,
      }));
      const payloadToSave = ensureBotConfigShape({
        ...botConfig,
        startTemplates,
      });
      const payload = await apiFetch<RecoveryBotConfig>("/hbx-recovery/bot-config", {
        method: "PATCH",
        body: JSON.stringify(payloadToSave),
      });
      setBotConfig(
        syncBotConfigWithMetaTemplates(
          ensureBotConfigShape(payload || DEFAULT_BOT_CONFIG),
          metaTemplates,
        ),
      );
      setNotice("Editor do bot salvo. Novas respostas do Recovery ja usam essa configuracao.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao salvar editor do bot";
      setNotice(`Falha ao salvar editor do bot: ${reason}`);
    } finally {
      setSavingBotConfig(false);
    }
  }

  function syncRecoveryTabInUrl(nextTab: RecoveryTab) {
    if (!pathname) return;
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (nextTab === "messages") {
      params.delete("tab");
    } else {
      params.set("tab", nextTab);
    }
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }

  function handleTabChange(nextTab: RecoveryTab) {
    if (nextTab === activeTab && renderedTab === nextTab) return;
    setActiveTab(nextTab);
    syncRecoveryTabInUrl(nextTab);
    if (nextTab === "templates") {
      loadMetaTemplates(false).catch(() => undefined);
    }
    if (nextTab === "bot") {
      loadFlowStages({ silent: false }).catch(() => undefined);
    }
    if (nextTab !== "messages") {
      setInteractionDetail(null);
      setInteractionNoteDraft("");
    }

    if (tabTransitionTimerRef.current !== null) {
      window.clearTimeout(tabTransitionTimerRef.current);
    }

    setTabTransitionStage("exit");
    tabTransitionTimerRef.current = window.setTimeout(() => {
      setRenderedTab(nextTab);
      setTabTransitionStage("enter");
      tabTransitionTimerRef.current = window.setTimeout(() => {
        setTabTransitionStage("idle");
        tabTransitionTimerRef.current = null;
      }, 240);
    }, 170);
  }

  async function refundPayment(paymentId: string) {
    setRefundingPaymentId(paymentId);
    try {
      await apiFetch(`/hbx-recovery/payments/${paymentId}/refund`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await Promise.all([loadPaymentHistory(paymentMonth, paymentFilter), reloadCustomers()]);
      setNotice("Estorno solicitado e sincronizado com o Recovery.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao estornar pagamento";
      setNotice(`Falha no estorno: ${reason}`);
    } finally {
      setRefundingPaymentId(null);
    }
  }

  async function handleDrawerAction(actionId: DrawerActionId) {
    if (!selectedCustomer) return;

    setDrawerBusyAction(actionId);
    try {
      if (actionId === "toggle_automation") {
        const nextEnabled = !selectedCustomer.automationEnabled;
        const updatedCustomer = await saveCustomerAutomation(selectedCustomer.id, nextEnabled);
        if (updatedCustomer) {
          setNotice(
            `Cobranca automatica de ${selectedCustomer.name} ${
              nextEnabled ? "reativada" : "pausada"
            }.`,
          );
        }
        return;
      }

      if (actionId === "mark_paid") {
        const result = await apiFetch<{
          changed: boolean;
          paidAmount: number;
          customer: RecoveryCustomer;
        }>(`/hbx-recovery/customers/${selectedCustomer.id}/mark-paid`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });

        mergeCustomersIntoState([result.customer]);

        if (!result.changed) {
          setNotice(`${selectedCustomer.name} ja esta com a conta quitada.`);
        } else {
          setNotice(
            `Conta de ${selectedCustomer.name} marcada como paga (${formatCurrency(
              result.paidAmount,
            )}).`,
          );
        }
        return;
      }

      if (selectedCustomer.openAmount <= 0) {
        setNotice(
          `A conta de ${selectedCustomer.name} ja esta quitada. Nao ha cobranca pendente para envio.`,
        );
        return;
      }

      if (actionId === "send_charge") {
        const result = await apiFetch<{
          customer?: RecoveryCustomer;
          template?: { name: string; language: string };
        }>(`/hbx-recovery/customers/${selectedCustomer.id}/start-template`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        if (result?.customer) {
          mergeCustomersIntoState([result.customer]);
        }
        scheduleCustomerRefresh();
        setNotice(
          `Template inicial enfileirado para ${selectedCustomer.name}. O status real sera atualizado apos o retorno da Meta.`,
        );
        return;
      } else if (actionId === "send_pix") {
        await apiFetch(`/hbx-recovery/customers/${selectedCustomer.id}/send-payment-link`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      } else {
        const body = buildRecoveryMessage(selectedCustomer, actionId);
        await apiFetch("/whatsapp/send", {
          method: "POST",
          body: JSON.stringify({
            to: selectedCustomer.whatsappNumber,
            contactId: selectedCustomer.contactId || selectedCustomer.id,
            body,
            messageType: "text",
            sourceModule: "hbx_recovery",
          }),
        });
      }

      const actionLabel =
        actionId === "send_pix" ? "Link Pix" : "Oferta de parcelamento";
      setNotice(
        actionId === "send_pix"
          ? `Link de pagamento criado e enviado para ${selectedCustomer.name}.`
          : `${actionLabel} enfileirado para ${selectedCustomer.name} via API da empresa.`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao enviar mensagem";
      setNotice(`Falha no envio para ${selectedCustomer.name}: ${reason}`);
    } finally {
      setDrawerBusyAction(null);
    }
  }

  function toggleCustomerSelection(customerId: string) {
    setSelectedCustomerIds((current) =>
      current.includes(customerId)
        ? current.filter((item) => item !== customerId)
        : [...current, customerId],
    );
  }

  function toggleAllFilteredCustomers() {
    if (!filteredCustomers.length) {
      setSelectedCustomerIds([]);
      return;
    }
    setSelectedCustomerIds(
      allFilteredCustomersSelected ? [] : filteredCustomers.map((customer) => customer.id),
    );
  }

  async function handleCustomerAutomationToggle(customer: CustomerRow) {
    const nextEnabled = !customer.automationEnabled;
    setCustomerAutomationBusyId(customer.id);
    try {
      const updatedCustomer = await saveCustomerAutomation(customer.id, nextEnabled);
      if (updatedCustomer) {
        setNotice(
          `Cobranca automatica de ${customer.name} ${nextEnabled ? "ativada" : "pausada"}.`,
        );
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Erro ao atualizar cobranca automatica";
      setNotice(`Falha ao atualizar ${customer.name}: ${reason}`);
    } finally {
      setCustomerAutomationBusyId(null);
    }
  }

  function handleRegistrationDateCalendar(value: string) {
    const normalized = String(value || "").trim();
    if (!normalized) return;
    setDebtorFormError(null);
    setNewDebtor((current) => ({
      ...current,
      registrationDate: normalized,
      registrationDateInput: isoDateToMaskedDigits(normalized),
    }));
  }

  function handleRegistrationDateDigits(raw: string) {
    const formatted = formatDateDigitsInput(raw);
    const parsedIso = parseDigitsToIsoDate(formatted);
    setDebtorFormError(null);
    setNewDebtor((current) => ({
      ...current,
      registrationDateInput: formatted,
      registrationDate: parsedIso || current.registrationDate,
    }));
  }

  function openRegistrationDatePicker() {
    const picker = registrationDatePickerRef.current;
    if (!picker) return;
    if (typeof picker.showPicker === "function") {
      picker.showPicker();
      return;
    }
    picker.focus();
    picker.click();
  }

  function normalizeImportHeader(value: string) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "");
  }

  function resolveImportValue(row: Record<string, unknown>, aliases: string[]) {
    const entries = Object.entries(row || {});
    const normalizedAliases = new Set(aliases.map((item) => normalizeImportHeader(item)));
    for (const [key, value] of entries) {
      if (normalizedAliases.has(normalizeImportHeader(key))) {
        return value;
      }
    }
    return "";
  }

  function parseExcelDateValue(raw: unknown) {
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 59) {
      const serialDayMs = 24 * 60 * 60 * 1000;
      const excelEpoch = Date.UTC(1899, 11, 30);
      const parsedMs = excelEpoch + Math.round(raw) * serialDayMs;
      const parsedDate = new Date(parsedMs);
      if (!Number.isNaN(parsedDate.getTime())) {
        const year = parsedDate.getUTCFullYear();
        const month = String(parsedDate.getUTCMonth() + 1).padStart(2, "0");
        const day = String(parsedDate.getUTCDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    }
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      const year = raw.getFullYear();
      const month = String(raw.getMonth() + 1).padStart(2, "0");
      const day = String(raw.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    const text = String(raw ?? "").trim();
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const fromDigits = parseDigitsToIsoDate(text);
    if (fromDigits) return fromDigits;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return "";
  }

  function parseImportCurrency(raw: unknown) {
    const numeric = Number(
      String(raw ?? "")
        .trim()
        .replace(/[^\d,.-]/g, "")
        .replace(/\.(?=\d{3}(\D|$))/g, "")
        .replace(",", "."),
    );
    return Number.isFinite(numeric) ? numeric : NaN;
  }

  function openExcelImportPicker() {
    excelInputRef.current?.click();
  }

  function resetImportPreview() {
    setImportPreviewRows([]);
    setImportPreviewIssues([]);
    setImportPreviewError(null);
    setImportMessage(null);
    if (excelInputRef.current) {
      excelInputRef.current.value = "";
    }
  }

  async function downloadImportTemplate() {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const sheetRows = [
        {
          Empresa: "Colsani",
          Cliente: "Maria Silva",
          "WhatsApp (DDI)": "+5511999703340",
          "Valor em Aberto": 2500,
          "Dia do registro": "11/03/2026",
        },
      ];
      const worksheet = XLSX.utils.json_to_sheet(sheetRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Inadimplentes");
      XLSX.writeFile(workbook, "hbx-recovery-modelo-importacao.xlsx");
    } catch {
      const header = "Empresa,Cliente,WhatsApp (DDI),Valor em Aberto,Dia do registro";
      const sample = "Colsani,Maria Silva,+5511999703340,2500,11/03/2026";
      const blob = new Blob([`${header}\n${sample}\n`], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "hbx-recovery-modelo-importacao.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    }
  }

  async function handleExcelFileSelected(file: File | null) {
    if (!file) return;
    setImportPreviewRows([]);
    setImportPreviewIssues([]);
    setImportPreviewError(null);
    setImportMessage(null);
    try {
      const XLSX = await import("xlsx");
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("Arquivo sem planilha.");
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
      if (!rows.length) throw new Error("Nenhuma linha encontrada na planilha.");

      const parsedRows: RecoveryImportRow[] = [];
      const issues: RecoveryImportIssue[] = [];
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        const sourceRow = rowIndex + 2;
        const name = String(
          resolveImportValue(row, ["empresa", "nome_empresa", "nome da empresa", "name"]),
        ).trim();
        const clientName = String(
          resolveImportValue(row, ["cliente", "contato", "responsavel", "client_name"]),
        ).trim();
        const rawWhatsapp = String(
          resolveImportValue(row, ["whatsapp (ddi)", "whatsapp", "telefone", "phone", "celular"]),
        ).trim();
        const rawOpenAmount = resolveImportValue(row, [
          "valor em aberto",
          "valor_aberto",
          "valor",
          "open_amount",
          "debito",
        ]);
        const rawRegistrationDate = resolveImportValue(row, [
          "dia do registro",
          "dia_do_registro",
          "data registro",
          "registration_date",
          "vencimento",
        ]);

        const rowIssues: string[] = [];
        let whatsappNumber = "";
        if (!name) rowIssues.push("Empresa ausente");
        if (!clientName) rowIssues.push("Cliente ausente");
        try {
          whatsappNumber = normalizeWhatsAppNumber(rawWhatsapp);
        } catch {
          rowIssues.push("WhatsApp invalido");
        }

        const openAmount = parseImportCurrency(rawOpenAmount);
        if (!Number.isFinite(openAmount) || openAmount <= 0) {
          rowIssues.push("Valor em aberto invalido");
        }

        const registrationDate = parseExcelDateValue(rawRegistrationDate);
        if (!registrationDate) {
          rowIssues.push("Dia do registro invalido");
        }

        if (rowIssues.length > 0) {
          issues.push({ row: sourceRow, reason: rowIssues.join(", ") });
          continue;
        }

        parsedRows.push({
          sourceRow,
          name,
          clientName,
          whatsappNumber,
          openAmount,
          registrationDate,
        });
      }

      if (!parsedRows.length) {
        throw new Error(
          "Nenhuma linha valida. Colunas esperadas: Empresa, Cliente, WhatsApp, Valor em Aberto, Dia do Registro.",
        );
      }
      setImportPreviewRows(parsedRows.slice(0, 1000));
      setImportPreviewIssues(issues.slice(0, 100));
      setImportMessage(
        `Preview carregado: ${parsedRows.length} linha(s) validas${
          issues.length ? `, ${issues.length} com erro` : ""
        }.`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao ler planilha";
      setImportPreviewRows([]);
      setImportPreviewIssues([]);
      setImportPreviewError(reason);
    }
  }

  async function confirmImportRows() {
    if (!importPreviewRows.length) {
      setImportPreviewError("Nenhuma linha para importar.");
      return;
    }
    setImportingRows(true);
    setImportPreviewError(null);
    try {
      const payload = await apiFetch<{
        totalRows: number;
        importedRows: number;
        failedRows: number;
      }>("/hbx-recovery/customers/import", {
        method: "POST",
        body: JSON.stringify({
          rows: importPreviewRows.map((row) => ({
            name: row.name,
            clientName: row.clientName,
            whatsappNumber: row.whatsappNumber,
            openAmount: row.openAmount,
            registrationDate: row.registrationDate,
          })),
        }),
      });
      await reloadCustomers();
      setImportMessage(
        `Importacao concluida: ${payload.importedRows}/${payload.totalRows} linha(s) importadas.`,
      );
      setImportPreviewRows([]);
      setImportPreviewIssues([]);
      if (excelInputRef.current) {
        excelInputRef.current.value = "";
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro ao importar planilha";
      setImportPreviewError(reason);
    } finally {
      setImportingRows(false);
    }
  }

  function createDebtor() {
    const companyName = String(newDebtor.companyName || "").trim();
    const clientName = String(newDebtor.clientName || "").trim();
    const whatsappNumber = normalizeWhatsAppNumber(newDebtor.whatsappNumber);
    const openAmount = Number(newDebtor.openAmount);
    const registrationDate = String(newDebtor.registrationDate || "").trim();
    const parsedRegistrationDate = /^\d{4}-\d{2}-\d{2}$/.test(registrationDate)
      ? registrationDate
      : parseDigitsToIsoDate(newDebtor.registrationDateInput);

    if (companyName.length < 3) {
      setDebtorFormError("Informe a empresa com pelo menos 3 caracteres.");
      return;
    }
    if (clientName.length < 2) {
      setDebtorFormError("Informe o nome do cliente/responsavel.");
      return;
    }
    if (!/^\+\d{10,15}$/.test(whatsappNumber)) {
      setDebtorFormError("Telefone invalido. Use formato internacional com DDI, ex: +5511999999999.");
      return;
    }
    if (!Number.isFinite(openAmount) || openAmount <= 0) {
      setDebtorFormError("Valor em aberto deve ser maior que zero.");
      return;
    }
    if (!parsedRegistrationDate) {
      setDebtorFormError("Dia do registro invalido. Digite DD/MM/AA (ex: 110326) ou selecione no calendario.");
      return;
    }

    setDebtorFormBusy(true);
    apiFetch<RecoveryCustomer>("/hbx-recovery/customers", {
      method: "POST",
      body: JSON.stringify({
        name: companyName,
        clientName,
        whatsappNumber,
        openAmount: Math.round(openAmount),
        registrationDate: parsedRegistrationDate,
      }),
    })
      .then((created) => {
        setCustomerSource((current) => [created, ...current]);
        setNotice(`Inadimplente da empresa ${companyName} cadastrado em ${formatRegistrationDate(parsedRegistrationDate)}.`);
        setDebtorFormError(null);
        const defaultDate = todayIsoDate();
        setNewDebtor({
          companyName: "",
          clientName: "",
          whatsappNumber: "",
          openAmount: "",
          registrationDate: defaultDate,
          registrationDateInput: isoDateToMaskedDigits(defaultDate),
        });
        openCustomer(created.id);
      })
      .catch((error) => {
        const reason = error instanceof Error ? error.message : "Erro ao cadastrar inadimplente";
        setDebtorFormError(reason);
      })
      .finally(() => {
        setDebtorFormBusy(false);
      });
  }

  const selectedConversationSummary = interactionDetail
    ? interactionSummary.conversations.find(
        (item) => item.conversationId === interactionDetail.conversationId,
      ) || null
    : null;
  const latestPayment = interactionDetail?.latestPayment || null;
  const linkExpired = Boolean(
    latestPayment?.linkExpiresAt &&
      new Date(latestPayment.linkExpiresAt).getTime() < Date.now() &&
      String(latestPayment.status || "").toLowerCase() !== "approved",
  );
  const paymentIsPaid = ["approved", "released"].includes(
    String(latestPayment?.status || "").toLowerCase(),
  );
  const awaitingResponse = [
    "aguardando_resposta_template",
    "cobranca_menu_principal",
    "escolhendo_parcelamento",
    "confirmando_parcelamento",
    "aguardando_pagamento",
  ].includes(String(interactionDetail?.currentStep || "").toLowerCase());
  const paymentAttemptCount = interactionDetail
    ? interactionDetail.messages.filter(
        (message) =>
          String(message.messageType || "").toLowerCase() === "payment_link" ||
          String(message.body || "").toLowerCase().includes("link de pagamento"),
      ).length
    : 0;
  const isInteractionBusy = (conversationId: number, action: string) =>
    interactionActionBusy === `${conversationId}:${action}`;
  const selectedInteractionPhone = interactionDetail
    ? getLiveInteractionPhone({
        conversationWhatsapp: interactionDetail.customer.conversationWhatsapp,
        customerWhatsapp: interactionDetail.customer.whatsappNumber,
      })
    : "-";
  const getMetaStatusBadgeClass = (statusRaw: string) => {
    const normalized = String(statusRaw || "").trim().toUpperCase();
    if (normalized === "APPROVED") return styles.statePaid;
    if (normalized === "PENDING" || normalized === "IN_APPEAL") return styles.stateGenerated;
    if (normalized === "REJECTED" || normalized === "PAUSED" || normalized === "DISABLED")
      return styles.stateExpired;
    return styles.stateWaiting;
  };

  const recoveryWorkspacePanels: WorkspacePanelDescriptor[] =
    buildSharedConversationWorkspacePanels({
      list: {
        title: "Conversas",
        description: "Fila de cobrança com triagem, prioridade humana e histórico recente.",
        accent: "#2563eb",
        minimumWidth: 300,
        minimumHeight: 240,
        initialWidth: 360,
      },
      main: {
        title: "Chat",
        description: "Historico principal da cobranca e contexto do fluxo.",
        accent: "#0f766e",
        minimumWidth: 560,
        minimumHeight: 320,
        initialWidth: 820,
      },
      composer: {
        title: "Resposta",
        description: "Resposta humana com crescimento vertical livre.",
        accent: "#1d4ed8",
        minimumWidth: 520,
        minimumHeight: 240,
        initialHeight: 280,
      },
      context: {
        title: "Financeiro / Ações",
        description: "Resumo financeiro, controles operacionais e nota interna.",
        accent: "#b45309",
        minimumWidth: 320,
        minimumHeight: 260,
        initialWidth: 380,
      },
    });

  const recoveryWorkspaceComponents = {
      [SHARED_CONVERSATION_WORKSPACE_IDS.listComponent]: () => (
        <ConversationListPane
          eyebrow="Recovery"
          title="Fila"
          description="Cobrancas abertas, prioridade humana e status do fluxo."
          count={displayedInteractionConversations.length}
          className={styles.workspaceDockPanel}
          bodyClassName={`${styles.workspaceDockBody} ${styles.workspaceDockQueueBody}`}
        >
          {humanAttentionFeed.length > 0 ? (
            <ChatInfoCard title="Prioridade humana" meta={humanAttentionFeed.length}>
              <ChatQueue>
                {humanAttentionFeed.map((item) => (
                  <ChatQueueItem
                    key={item.id}
                    onClick={() => openHumanAttentionConversation(item.conversationId)}
                    initials={String(item.customerName || item.phone).slice(0, 2).toUpperCase()}
                    label={item.kind === "human_queue" ? "HUM" : "MSG"}
                    tone="amber"
                    title={item.customerName}
                    subtitle={item.phone}
                    preview={item.preview}
                    meta={item.attentionLabel}
                    badges={
                      <>
                        <ChatBadge tone="warning">
                          {item.kind === "human_queue" ? "Aguardando humano" : "Nova mensagem"}
                        </ChatBadge>
                        <ChatBadge tone="neutral">{item.moduleLabel}</ChatBadge>
                      </>
                    }
                  />
                ))}
              </ChatQueue>
            </ChatInfoCard>
          ) : null}

          {loadingInteractions ? (
            <ChatEmptyState title="Carregando conversas">A fila de cobranca esta sendo sincronizada.</ChatEmptyState>
          ) : interactionsError && displayedInteractionConversations.length === 0 ? (
            <ConversationWorkspaceStatus
              title="Falha ao carregar conversas"
              description={interactionsError}
              tone="error"
              diagnostics={[
                {
                  label: "Sessao",
                  value: hasToken === true ? "ativa" : hasToken === false ? "sem token" : "validando",
                },
                {
                  label: "Fila",
                  value:
                    interactionsQueue === "all"
                      ? "Conversas"
                      : interactionsQueue === "closed"
                        ? "Conversas encerradas"
                        : "Clientes bloqueados",
                },
                {
                  label: "Recebidas",
                  value: String(interactionSummary.conversations.length),
                },
                {
                  label: "Visiveis",
                  value: String(displayedInteractionConversations.length),
                },
                {
                  label: "Aberta",
                  value: interactionDetail?.conversationId || "--",
                },
                {
                  label: "Ultima leitura",
                  value: lastInteractionsSyncAt ? formatDateTime(lastInteractionsSyncAt) : "nenhuma",
                },
              ]}
              onRetry={() => {
                void loadInteractions(interactionsQueue);
              }}
              retryLabel="Recarregar fila"
            />
          ) : displayedInteractionConversations.length === 0 ? (
            <ChatEmptyState title="Nenhuma conversa encontrada">
              Ajuste o filtro ou aguarde novas interacoes entrarem na fila.
            </ChatEmptyState>
          ) : (
            <ChatQueue className={styles.interactionsList}>
              {displayedInteractionConversations.map((item) => (
                <ChatQueueItem
                  key={item.conversationId}
                  active={interactionDetail?.conversationId === item.conversationId}
                  onClick={() => loadInteractionDetail(item.conversationId)}
                  disabled={loadingInteractionDetailId === item.conversationId}
                  initials={String(item.customerName || item.customerWhatsapp || item.conversationId).slice(0, 2).toUpperCase()}
                  label={getRecoveryQueueLabel(item)}
                  tone={mapRecoveryQueueTone(item)}
                  title={item.customerName}
                  subtitle={getLiveInteractionPhone({
                    conversationWhatsapp: item.conversationWhatsapp,
                    customerWhatsapp: item.customerWhatsapp,
                  })}
                  preview={item.lastMessage || "-"}
                  meta={formatDateTime(item.lastAt)}
                  badges={<ConversationBadgeList badges={buildRecoveryQueueBadges(item)} />}
                />
              ))}
            </ChatQueue>
          )}
        </ConversationListPane>
      ),
      [SHARED_CONVERSATION_WORKSPACE_IDS.mainComponent]: () => (
        <ConversationMainPane
          eyebrow="Chat"
          title={interactionDetail?.customer.name || "Chat"}
          description="Historico da cobranca, etapa atual e leitura operacional."
          count={visibleInteractionMessages.length}
          className={styles.workspaceDockPanel}
          bodyClassName={`${styles.workspaceDockBody} ${styles.workspaceDockDetailBody}`}
        >
          {!interactionDetail ? (
            <ChatEmptyState title="Nenhuma conversa selecionada">
              Escolha uma conversa na fila para abrir o chat e as acoes da cobranca.
            </ChatEmptyState>
          ) : interactionDetailError && interactionDetail.conversationId ? (
            <ConversationWorkspaceStatus
              title="Falha ao abrir conversa"
              description={interactionDetailError}
              tone="error"
              diagnostics={[
                {
                  label: "Conversa",
                  value: interactionDetail.conversationId,
                },
                {
                  label: "Cliente",
                  value: interactionDetail.customer.name || "--",
                },
                {
                  label: "Etapa",
                  value: mapRecoveryFlowStepLabel(interactionDetail.currentStep),
                },
                {
                  label: "Mensagens em cache",
                  value: String(interactionDetail.messages.length),
                },
                {
                  label: "Ultima leitura",
                  value: lastInteractionsSyncAt ? formatDateTime(lastInteractionsSyncAt) : "nenhuma",
                },
              ]}
              onRetry={() => {
                void loadInteractionDetail(interactionDetail.conversationId);
              }}
              retryLabel="Reabrir conversa"
            />
          ) : (
            <ChatThread
              avatar={(() => {
                const avatarMeta = getRecoveryThreadAvatarMeta(interactionDetail, {
                  paymentGenerated: Boolean(latestPayment?.paymentUrl),
                });
                return (
                  <ChatAvatar
                    initials={String(interactionDetail.customer.name || selectedInteractionPhone).slice(0, 2).toUpperCase()}
                    label={avatarMeta.label}
                    tone={avatarMeta.tone}
                  />
                );
              })()}
              title={interactionDetail.customer.name}
              subtitle={selectedInteractionPhone}
              badges={(
                <ConversationBadgeList
                  badges={buildRecoveryThreadBadges(interactionDetail, {
                    paymentGenerated: Boolean(latestPayment?.paymentUrl),
                    paymentIsPaid,
                    linkExpired,
                  })}
                />
              )}
              actions={
                <ChatIconButton
                  icon="spark"
                  label={showSystemMessages ? "Eventos on" : "Eventos"}
                  onClick={() => setShowSystemMessages((current) => !current)}
                  title="Alternar eventos do sistema"
                  aria-label="Alternar eventos do sistema"
                />
              }
            >
              <div ref={interactionMessageListRef} className={styles.interactionMessageList}>
                {visibleInteractionMessages.length === 0 ? (
                  <ChatEmptyState title="Nenhuma mensagem visivel">
                    Ative os eventos do sistema ou aguarde novas interacoes.
                  </ChatEmptyState>
                ) : (
                  visibleInteractionMessages.map((message) => (
                    <ChatMessageBubble
                      key={message.id}
                      tone={mapRecoveryMessageTone(message)}
                      sender={mapSenderLabel(message.senderType, message.direction)}
                      messageType={String(message.messageType || "text").replace(/_/g, " ")}
                      meta={formatDateTime(message.timestamp)}
                    >
                      <p>{message.body}</p>
                    </ChatMessageBubble>
                  ))
                )}
              </div>
            </ChatThread>
          )}
        </ConversationMainPane>
      ),
      [SHARED_CONVERSATION_WORKSPACE_IDS.composerComponent]: () => (
        <ChatDockPanel
          eyebrow="Resposta"
          title="Resposta humana"
          description="Escreva sem apertar o historico do cliente."
          count={interactionReplyDraft.trim().length}
          className={styles.workspaceDockPanel}
          bodyClassName={`${styles.workspaceDockBody} ${styles.workspaceDockComposerBody}`}
        >
          {!interactionDetail ? (
            <ChatEmptyState title="Resposta indisponivel">Abra uma conversa para responder manualmente.</ChatEmptyState>
          ) : (
            <ChatComposer
              title="Responder ao cliente"
              description="Mensagem humana enviada para este WhatsApp."
              toolbar={
                <>
                  <ChatIconButton icon="phone" title="Canal WhatsApp" aria-label="Canal WhatsApp" />
                  <ChatIconButton icon="send" title="Pronto para enviar" aria-label="Pronto para enviar" />
                </>
              }
              footer={
                <>
                  <ChatFieldNote>
                    {Boolean(interactionDetail.isBlocked)
                      ? "Cliente bloqueado para novas mensagens."
                      : "A resposta sera registrada no historico desta cobranca."}
                  </ChatFieldNote>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => sendInteractionReply(interactionDetail.conversationId)}
                    disabled={
                      isInteractionBusy(interactionDetail.conversationId, "send_message") ||
                      Boolean(interactionDetail.isBlocked)
                    }
                  >
                    {isInteractionBusy(interactionDetail.conversationId, "send_message")
                      ? "Enviando..."
                      : "Enviar mensagem"}
                  </button>
                </>
              }
            >
              <textarea
                id="recovery-chat-reply"
                name="recoveryChatReply"
                className="field"
                rows={6}
                value={interactionReplyDraft}
                placeholder="Digite a mensagem que deve ser enviada ao cliente..."
                onChange={(event) => setInteractionReplyDraft(event.target.value)}
                disabled={
                  Boolean(interactionDetail.isBlocked) ||
                  String(interactionDetail.currentStep || "").trim().toLowerCase() === "encerrado"
                }
              />
            </ChatComposer>
          )}
        </ChatDockPanel>
      ),
      [SHARED_CONVERSATION_WORKSPACE_IDS.contextComponent]: () => (
        <ConversationContextPanel
          eyebrow="Operacao"
          title="Financeiro / Acoes"
          description="Resumo financeiro, controles e nota interna."
          count={interactionDetail ? "LIVE" : "--"}
          className={styles.workspaceDockPanel}
          bodyClassName={`${styles.workspaceDockBody} ${styles.workspaceDockFinanceBody}`}
        >
          {!interactionDetail ? (
            <ChatEmptyState title="Sem contexto ativo">Abra uma conversa para liberar a operacao financeira.</ChatEmptyState>
          ) : (
            <ChatSideGrid>
              <ChatInfoCard title="Acoes rapidas" meta="Recovery">
                <ChatActionGrid>
                  <ConversationActionList
                    actions={buildRecoveryQuickActions({
                      conversationId: interactionDetail.conversationId,
                      isBusy: isInteractionBusy,
                      runAction: runInteractionAction,
                    })}
                  />
                </ChatActionGrid>
              </ChatInfoCard>

              <ChatInfoCard title="Resumo financeiro" meta={mapPaymentStatusLabel(latestPayment?.status)}>
                {buildRecoveryFinancialSummary({
                  detail: interactionDetail,
                  companyLabel: String(interactionDetail.metadata?.empresa || "-"),
                  latestPaymentStatusLabel: mapPaymentStatusLabel(latestPayment?.status),
                  latestPaymentUrlLabel: latestPayment?.paymentUrl ? "Gerado" : "-",
                  paymentAttemptCount,
                  lastInteractionLabel: formatDateTime(interactionDetail.lastInteractionAt),
                  formatCurrency,
                }).map((item) => (
                  <p key={item.label}>
                    <strong>{item.label}:</strong> {item.value}
                  </p>
                ))}
              </ChatInfoCard>

              <ChatInfoCard title="Nota interna" meta="Equipe">
                <ChatFieldNote>Registro interno da equipe. Nada daqui vai para o cliente.</ChatFieldNote>
                <textarea
                  id="recovery-internal-note"
                  name="recoveryInternalNote"
                  className="field"
                  rows={4}
                  value={interactionNoteDraft}
                  placeholder="Ex: Cliente pediu retorno sexta as 15h."
                  onChange={(event) => setInteractionNoteDraft(event.target.value)}
                  disabled={Boolean(interactionDetail.isBlocked)}
                />
                <ChatActionButton
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => saveInteractionInternalNote(interactionDetail.conversationId)}
                  disabled={isInteractionBusy(interactionDetail.conversationId, "internal_note")}
                >
                  {isInteractionBusy(interactionDetail.conversationId, "internal_note")
                    ? "Salvando..."
                    : "Salvar nota"}
                </ChatActionButton>
              </ChatInfoCard>
            </ChatSideGrid>
          )}
        </ConversationContextPanel>
      ),
    };

  return (
    <>
      {noticeRendered && notice ? (
        <div className={styles.noticeViewport} role="status" aria-live="polite">
          <div
            className={`alert ${
              noticeTone === "error" ? "alert-error" : "alert-info"
            } ${styles.noticeToast} ${styles.tabTransitionStage} ${
              noticeTransitionStage === "exit"
                ? styles.tabTransitionExit
                : noticeTransitionStage === "enter"
                  ? styles.tabTransitionEnter
                  : ""
            }`}
          >
            <span>{notice}</span>
            <button
              type="button"
              className={styles.noticeClose}
              onClick={() => setNotice(null)}
              disabled={!noticeCloseReady}
              aria-label="Fechar aviso"
            >
              {noticeCloseReady ? "Fechar" : "Aguarde..."}
            </button>
          </div>
        </div>
      ) : null}

      {humanAttentionPopup ? (
        <div className={styles.humanAttentionViewport} role="status" aria-live="polite">
          <div className={`${styles.humanAttentionCard} ${styles.tabTransitionStage} ${styles.tabTransitionEnter}`}>
            <div className={styles.humanAttentionHeader}>
              <div>
                <p className={styles.humanAttentionEyebrow}>
                  {humanAttentionPopup.kind === "human_queue"
                    ? `${humanAttentionFeed.length || 1} mensagem${(humanAttentionFeed.length || 1) === 1 ? "" : "s"}`
                    : "Nova mensagem aguardando resposta"}
                </p>
                <p className={styles.humanAttentionPhone}>{humanAttentionPopup.moduleLabel}</p>
                <strong className={styles.humanAttentionTitle}>
                  {humanAttentionPopup.customerName}
                </strong>
                <p className={styles.humanAttentionPhone}>{humanAttentionPopup.phone}</p>
              </div>
              <span className={styles.humanAttentionCount}>
                {humanAttentionPopup.attentionLabel}
              </span>
            </div>
            <p className={styles.humanAttentionPreview}>{humanAttentionPopup.preview}</p>
            <div className={styles.humanAttentionActions}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => openHumanAttentionConversation(humanAttentionPopup.conversationId)}
              >
                Abrir conversa
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  dismissHumanAttention(humanAttentionPopup.conversationId, {
                    lastAt: humanAttentionPopup.lastAt,
                    kind: humanAttentionPopup.kind,
                  })
                }
              >
                Dispensar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <DashboardScaffold
        title="Recovery"
        description="Gestão inteligente de inadimplência com score de risco, cobrança automatizada e leitura clara do impacto financeiro."
        showDashboardShortcut={false}
        layoutMode="workspace"
        actions={
          <div className={styles.heroActions}>
              <div className={styles.heroTabGroup} role="tablist" aria-label="Guias do Recovery">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "recovery"}
                className={activeTab === "recovery" ? styles.heroTabActive : styles.heroTab}
                onClick={() => handleTabChange("recovery")}
              >
                Recovery
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "register"}
                className={activeTab === "register" ? styles.heroTabActive : styles.heroTab}
                onClick={() => handleTabChange("register")}
              >
                Tabela de inadimplentes
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "payments"}
                className={activeTab === "payments" ? styles.heroTabActive : styles.heroTab}
                onClick={() => handleTabChange("payments")}
              >
                Histórico de pagamentos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "messages"}
                className={activeTab === "messages" ? styles.heroTabActive : styles.heroTab}
                onClick={() => handleTabChange("messages")}
              >
                Chat
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "templates"}
                className={activeTab === "templates" ? styles.heroTabActive : styles.heroTab}
                onClick={() => handleTabChange("templates")}
              >
                Templates Meta
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "bot"}
                className={activeTab === "bot" ? styles.heroTabActive : styles.heroTab}
                onClick={() => handleTabChange("bot")}
              >
                Editor do bot
              </button>
            </div>
          </div>
        }
      >
        <div
          className={`${styles.tabTransitionStage} ${
            tabTransitionStage === "exit"
              ? styles.tabTransitionExit
              : tabTransitionStage === "enter"
                ? styles.tabTransitionEnter
                : ""
          }`}
        >
        {renderedTab === "register" ? (
          <section className={`panel ${styles.sectionCard} ${styles.registerPanel}`}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Cadastro operacional</p>
                <h2 className={styles.sectionTitle}>Cadastrar inadimplente</h2>
                <p className={styles.sectionDescription}>
                  Dia do registro usa data real. Voce pode selecionar no calendario ou digitar no formato numerico (ex: 110326).
                </p>
              </div>
            </div>

            <div className={styles.registerGrid}>
              <article className={styles.registerCard}>
                <label className={styles.fieldBlock}>
                  <span>Empresa</span>
                  <input
                    className="field"
                    placeholder="Ex: Vortex Engenharia"
                    value={newDebtor.companyName}
                    onChange={(event) => {
                      setDebtorFormError(null);
                      setNewDebtor((current) => ({ ...current, companyName: event.target.value }));
                    }}
                  />
                </label>

                <label className={styles.fieldBlock}>
                  <span>Cliente</span>
                  <input
                    className="field"
                    placeholder="Ex: Maria Silva"
                    value={newDebtor.clientName}
                    onChange={(event) => {
                      setDebtorFormError(null);
                      setNewDebtor((current) => ({ ...current, clientName: event.target.value }));
                    }}
                  />
                </label>

                <label className={styles.fieldBlock}>
                  <span>WhatsApp (DDI)</span>
                  <input
                    className="field"
                    placeholder="+5511999999999"
                    value={newDebtor.whatsappNumber}
                    onChange={(event) => {
                      setDebtorFormError(null);
                      setNewDebtor((current) => ({
                        ...current,
                        whatsappNumber: event.target.value,
                      }));
                    }}
                  />
                </label>

                <div className={styles.registerInlineFields}>
                  <label className={styles.fieldBlock}>
                    <span>Valor em aberto</span>
                    <input
                      className="field"
                      type="number"
                      min={1}
                      step={1}
                      placeholder="2500"
                      value={newDebtor.openAmount}
                      onChange={(event) => {
                        setDebtorFormError(null);
                        setNewDebtor((current) => ({ ...current, openAmount: event.target.value }));
                      }}
                    />
                  </label>
                  <label className={styles.fieldBlock}>
                    <span>Dia do registro</span>
                    <div className={styles.dateInputWrap}>
                      <input
                        className="field"
                        inputMode="numeric"
                        placeholder="110326"
                        value={newDebtor.registrationDateInput}
                        onChange={(event) => handleRegistrationDateDigits(event.target.value)}
                        onBlur={(event) => {
                          const parsed = parseDigitsToIsoDate(event.target.value);
                          if (parsed) handleRegistrationDateCalendar(parsed);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={openRegistrationDatePicker}
                      >
                        Calendario
                      </button>
                    </div>
                    <input
                      className={styles.hiddenDateInput}
                      ref={registrationDatePickerRef}
                      type="date"
                      value={newDebtor.registrationDate}
                      onChange={(event) => handleRegistrationDateCalendar(event.target.value)}
                    />
                  </label>
                </div>

                {debtorFormError ? (
                  <div className="alert alert-error">{debtorFormError}</div>
                ) : null}

                <div className={styles.registerActions}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={createDebtor}
                    disabled={debtorFormBusy}
                  >
                    {debtorFormBusy ? "Salvando..." : "Cadastrar inadimplente"}
                  </button>
                </div>
              </article>

              <article className={styles.registerCard}>
                <p className={styles.sectionEyebrow}>Importacao e integracoes</p>
                <h3 className={styles.sectionTitle}>Entrada em lote</h3>
                <p className={styles.sectionDescription}>
                  Importe sua planilha real com as mesmas colunas do cadastro: Empresa, Cliente, WhatsApp, Valor em aberto e Dia do registro.
                </p>
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className={styles.hiddenFileInput}
                  onChange={(event) => handleExcelFileSelected(event.target.files?.[0] || null)}
                />
                <div className={styles.importActions}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={openExcelImportPicker}
                  >
                    Importar Excel
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={downloadImportTemplate}>
                    Baixar modelo
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={confirmImportRows}
                    disabled={importingRows || importPreviewRows.length === 0}
                  >
                    {importingRows ? "Importando..." : "Confirmar gravacao"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled>
                    Conectar API/JOB
                  </button>
                  {importPreviewRows.length > 0 ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={resetImportPreview}>
                      Limpar preview
                    </button>
                  ) : null}
                </div>
                {importMessage ? <div className="alert alert-info">{importMessage}</div> : null}
                {importPreviewError ? <div className="alert alert-error">{importPreviewError}</div> : null}
                {importPreviewIssues.length > 0 ? (
                  <div className={styles.importIssues}>
                    <p>Linhas com erro (primeiras 100):</p>
                    <ul>
                      {importPreviewIssues.slice(0, 8).map((issue) => (
                        <li key={`issue-${issue.row}`}>
                          Linha {issue.row}: {issue.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {importPreviewRows.length > 0 ? (
                  <div className={styles.importPreviewWrap}>
                    <table className={styles.importPreviewTable}>
                      <thead>
                        <tr>
                          <th>Linha</th>
                          <th>Empresa</th>
                          <th>Cliente</th>
                          <th>WhatsApp</th>
                          <th>Valor</th>
                          <th>Dia do registro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreviewRows.slice(0, 10).map((row) => (
                          <tr key={`preview-${row.sourceRow}`}>
                            <td>{row.sourceRow}</td>
                            <td>{row.name}</td>
                            <td>{row.clientName}</td>
                            <td>{row.whatsappNumber}</td>
                            <td>{formatCurrency(row.openAmount)}</td>
                            <td>{formatRegistrationDate(row.registrationDate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreviewRows.length > 10 ? (
                      <p className={styles.previewHint}>
                        Mostrando 10 de {importPreviewRows.length} linhas validas.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </div>

            <article className={`panel ${styles.sectionCard} ${styles.registerTableCard}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Base atual</p>
                  <h3 className={styles.sectionTitle}>Tabela de inadimplentes</h3>
                  <p className={styles.sectionDescription}>
                    Mesmo frontend da carteira do Recovery, com score de risco e abertura rapida no drawer.
                  </p>
                </div>
                <span className="badge badge-brand">
                  {loadingCustomers ? "Carregando..." : `${overdueCount} devendo / ${paidCount} pagas`}
                </span>
              </div>
              <div className={styles.tableToolbar}>
                <div className={styles.filterPills}>
                  {REGISTER_FILTER_OPTIONS.map((filterOption) => (
                    <button
                      key={filterOption.id}
                      type="button"
                      className={`${styles.filterPill} ${
                        customerRegisterFilter === filterOption.id ? styles.filterPillActive : ""
                      }`}
                      onClick={() => setCustomerRegisterFilter(filterOption.id)}
                    >
                      {filterOption.label}
                    </button>
                  ))}
                </div>
                <div className={styles.batchActions}>
                  <span className={styles.selectionMeta}>
                    {selectedFilteredCustomersCount} selecionados · {filteredCustomers.length} visiveis
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={toggleAllFilteredCustomers}
                    disabled={!filteredCustomers.length}
                  >
                    {allFilteredCustomersSelected ? "Limpar selecao" : "Selecionar visiveis"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleBatchAutomationUpdate(true)}
                    disabled={
                      !selectedCustomerIds.length || customerAutomationBatchBusy !== null
                    }
                  >
                    {customerAutomationBatchBusy === "enable"
                      ? "Ativando..."
                      : "Ativar auto em lote"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleBatchAutomationUpdate(false)}
                    disabled={
                      !selectedCustomerIds.length || customerAutomationBatchBusy !== null
                    }
                  >
                    {customerAutomationBatchBusy === "disable"
                      ? "Pausando..."
                      : "Pausar auto em lote"}
                  </button>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.scoreTable}>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Selecionar clientes visiveis"
                          checked={allFilteredCustomersSelected}
                          onChange={toggleAllFilteredCustomers}
                          disabled={!filteredCustomers.length}
                        />
                      </th>
                      <th>Empresa</th>
                      <th>Valor em aberto</th>
                      <th>Dia do registro</th>
                      <th>Score de risco</th>
                      <th>Auto</th>
                      <th>Acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((customer) => (
                      <tr
                        key={`register-${customer.id}`}
                        tabIndex={0}
                        className={`${styles.tableRow} ${
                          drawerCustomerId === customer.id ? styles.tableRowActive : ""
                        }`}
                        onClick={() => openCustomer(customer.id)}
                        onKeyDown={(event) => handleRowKeyDown(event, customer.id)}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${customer.name}`}
                            checked={selectedCustomerIdSet.has(customer.id)}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => toggleCustomerSelection(customer.id)}
                          />
                        </td>
                        <td>
                          <div className={styles.clientCell}>
                            <strong>{customer.name}</strong>
                            <span>Cliente: {customer.clientName || "-"}</span>
                            <span>{customer.lastContact}</span>
                          </div>
                        </td>
                        <td className={styles.monoCell}>{formatCurrency(customer.openAmount)}</td>
                        <td>
                          <div className={styles.delayCell}>
                            <strong>{formatRegistrationDate(customer.registrationDate)}</strong>
                            <span>
                              {customer.openAmount > 0
                                ? `${customer.daysSinceRegistration} dias em aberto`
                                : "Conta quitada"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`${styles.scoreBadge} ${getScoreClass(
                              customer.risk.tone,
                            )}`}
                          >
                            {customer.risk.label} {customer.risk.score}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`${styles.automationChip} ${
                              customer.automationEnabled
                                ? styles.automationChipOn
                                : styles.automationChipOff
                            }`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleCustomerAutomationToggle(customer);
                            }}
                            disabled={customerAutomationBusyId === customer.id}
                          >
                            {customerAutomationBusyId === customer.id
                              ? "..."
                              : customer.automationEnabled
                                ? "Ativa"
                                : "Pausada"}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              openCustomer(customer.id);
                            }}
                          >
                            Abrir
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!loadingCustomers && filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className={styles.emptyCell}>
                          Nenhum cliente encontrado para este filtro.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}

        {renderedTab === "recovery" ? (
          <>
        <section className={styles.impactGrid}>
          <article className={`panel panel-interactive ${styles.impactCard}`}>
            <p className={styles.cardEyebrow}>Impacto financeiro</p>
            <h2 className={styles.cardTitle}>Dinheiro Parado</h2>
            <p className={styles.cardValue}>
              <AnimatedNumber
                value={recoveryOverview.overdueTotal}
                formatter={formatCurrency}
              />
            </p>
            <p className={styles.cardFoot}>Total vencido atualmente</p>
          </article>

          <article className={`panel panel-interactive ${styles.impactCard}`}>
            <p className={styles.cardEyebrow}>Janela imediata</p>
            <h2 className={styles.cardTitle}>A vencer</h2>
            <p className={styles.cardValue}>
              <AnimatedNumber
                value={recoveryOverview.dueSoonTotal}
                formatter={formatCurrency}
              />
            </p>
            <p className={styles.cardFoot}>Proximos 7 dias</p>
          </article>

          <article className={`panel panel-interactive ${styles.impactCard}`}>
            <p className={styles.cardEyebrow}>Performance</p>
            <h2 className={styles.cardTitle}>Recuperado este mes</h2>
            <p className={styles.cardValue}>
              <AnimatedNumber
                value={recoveryOverview.recoveredThisMonth}
                formatter={formatCurrency}
              />
            </p>
            <p className={styles.cardFoot}>Valor recuperado via Recovery</p>
          </article>

          <article
            className={`panel panel-interactive ${styles.impactCard} ${styles.highlightCard}`}
          >
            <div className={styles.highlightHeader}>
              <div>
                <p className={styles.cardEyebrow}>Transformacao estrutural</p>
                <h2 className={styles.cardTitle}>Antes x Depois</h2>
              </div>
              <span className={`badge ${styles.reductionBadge}`}>
                <AnimatedNumber
                  value={recoveryOverview.reductionPercent}
                  formatter={formatPercent}
                />
              </span>
            </div>

            <div className={styles.comparisonGrid}>
              <div className={styles.comparisonItem}>
                <span>Antes da instalacao</span>
                <strong>
                  <AnimatedNumber
                    value={recoveryOverview.beforeInstallation}
                    formatter={formatCurrency}
                  />
                </strong>
              </div>
              <div className={styles.comparisonItem}>
                <span>Inadimplencia atual</span>
                <strong>
                  <AnimatedNumber
                    value={recoveryOverview.currentDelinquency}
                    formatter={formatCurrency}
                  />
                </strong>
              </div>
            </div>

            <p className={styles.cardFoot}>
              Reducao acumulada da carteira em atraso desde a ativacao do modulo.
            </p>
          </article>
        </section>

        <section>
          <article className={`panel ${styles.sectionCard}`}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Inteligência de recuperação</p>
                <h2 className={styles.sectionTitle}>Gráfico de recuperação mensal</h2>
                <p className={styles.sectionDescription}>
                  Evolucao dos valores recuperados via pagamentos registrados no Recovery.
                </p>
              </div>
              <span className="badge badge-brand">
                {loadingCustomers ? "Carregando..." : `${overdueCount} em cobranca`}
              </span>
            </div>

            <div className={styles.chartSurface}>
              <svg
                className={styles.chartSvg}
                viewBox={`0 0 ${recoveryChartSvg.width} ${recoveryChartSvg.height}`}
                role="img"
                aria-label="Gráfico de recuperação mensal"
              >
                {recoveryChartSvg.gridLines.map((line) => (
                  <g key={`grid-${line.y}`}>
                    <line
                      className={styles.chartGridLine}
                      x1={recoveryChartSvg.left}
                      y1={line.y}
                      x2={recoveryChartSvg.width - recoveryChartSvg.right}
                      y2={line.y}
                    />
                    <text className={styles.chartAxis} x={4} y={line.y + 4}>
                      {formatCurrency(line.value)}
                    </text>
                  </g>
                ))}
                {recoveryChartSvg.points.length > 1 ? (
                  <path className={styles.chartArea} d={recoveryChartSvg.areaPath} />
                ) : null}
                {recoveryChartSvg.points.length > 1 ? (
                  <path className={styles.chartLine} d={recoveryChartSvg.linePath} />
                ) : null}
                {recoveryChartSvg.points.map((point, index) => (
                  <g key={`point-${point.label}-${index}`}>
                    <circle
                      className={`${styles.chartPoint} ${
                        index === recoveryChartSvg.points.length - 1 ? styles.chartPointStrong : ""
                      }`}
                      cx={point.x}
                      cy={point.y}
                      r={5}
                    />
                    <text className={styles.chartAxis} x={point.x - 10} y={recoveryChartSvg.height - 12}>
                      {point.label}
                    </text>
                  </g>
                ))}
              </svg>
              <div className={styles.chartLegend}>
                <div className={styles.chartLegendItem}>
                  <span className={styles.chartLegendLabel}>Ultimo mes</span>
                  <strong className={styles.chartLegendValue}>
                    {formatCurrency(recoveryChartSvg.latest?.recovered || 0)}
                  </strong>
                  <span className={styles.chartLegendNote}>
                    {String(recoveryChartSvg.latest?.label || "-")}
                  </span>
                </div>
                <div className={styles.chartLegendItem}>
                  <span className={styles.chartLegendLabel}>Ultimos 6 meses</span>
                  <strong className={styles.chartLegendValue}>
                    {formatCurrency(recoveryChartSvg.total || 0)}
                  </strong>
                  <span className={styles.chartLegendNote}>Total recuperado acumulado</span>
                </div>
                <div className={styles.chartLegendItem}>
                  <span className={styles.chartLegendLabel}>Carteira atual</span>
                  <strong className={styles.chartLegendValue}>
                    {formatCurrency(recoveryOverview.overdueTotal)}
                  </strong>
                  <span className={styles.chartLegendNote}>
                    Valor ainda pendente na base atual
                  </span>
                </div>
              </div>
            </div>
          </article>
        </section>

          </>
        ) : null}

        {renderedTab === "templates" ? (
          <section className={`panel ${styles.sectionCard} ${styles.templatesMetaPanel}`}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Integracao oficial com a Meta</p>
                <h2 className={styles.sectionTitle}>Templates Meta</h2>
                <p className={styles.sectionDescription}>
                  Veja os templates, ative no HBX e configure a imagem quando houver cabecalho de midia.
                </p>
              </div>
              <div className={styles.heroActions}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => loadMetaTemplates(true)}
                  disabled={loadingMetaTemplates || metaTemplateBusy === "sync"}
                >
                  Atualizar lista
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={syncMetaTemplatesNow}
                  disabled={metaTemplateBusy === "sync"}
                >
                  {metaTemplateBusy === "sync" ? "Sincronizando..." : "Sincronizar com Meta"}
                </button>
              </div>
            </div>

            <div className={styles.metricRibbon}>
              <div>
                <span>Total PT-BR</span>
                <strong>{metaTemplates.counters.total}</strong>
              </div>
              <div>
                <span>Aprovados na Meta</span>
                <strong>{metaTemplates.counters.approved}</strong>
              </div>
              <div>
                <span>Ativos no HBX</span>
                <strong>{metaTemplates.counters.hbxActive}</strong>
              </div>
              <div>
                <span>Elegiveis no Editor</span>
                <strong>{metaTemplates.counters.eligible}</strong>
              </div>
            </div>

            <div className={styles.templateMetaContext}>
              <div>
                <span>Phone number ID ativo</span>
                <strong className={styles.templateMetaContextCode}>
                  {metaTemplates.phoneNumberId || "Nao resolvido"}
                </strong>
              </div>
              <div>
                <span>WABA ativo</span>
                <strong className={styles.templateMetaContextCode}>
                  {metaTemplates.wabaId || "Configure no MASTER"}
                </strong>
              </div>
              <div>
                <span>Ultima sincronizacao</span>
                <strong>{metaTemplates.lastSyncAt ? formatDateTime(metaTemplates.lastSyncAt) : "-"}</strong>
              </div>
            </div>

            <div className={styles.templateWindowOrganizerIntro}>
              <div>
                <strong>Segure a maozinha de qualquer janela para reorganizar tudo.</strong>
                <p>
                  O HBX entra no modo compacto, alinha os cards lado a lado e volta encaixando
                  automaticamente quando voce concluir.
                </p>
              </div>
              <div className={styles.templateWindowIntroActions}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setTemplateComposerPreviewVisible((current) => !current)}
                >
                  {templateComposerPreviewVisible ? "Ocultar preview" : "Mostrar preview"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => openTemplateWindowOrganizer()}
                >
                  Organizar janelas
                </button>
              </div>
            </div>

            <div className={styles.templateWindowDeck}>
              {deckTemplateWindows.map((windowId) => (
                <div key={`template-window-${windowId}`} className={styles.templateWindowDeckSlot}>
                  {renderTemplateWindowCard(windowId)}
                </div>
              ))}
            </div>

            {typeof document !== "undefined" && templatePreviewRendered
              ? createPortal(renderTemplatePreviewWindow(), document.body)
              : null}

            {false ? (
              <>
            <div className={styles.templatesSectionFlow} style={templatesSectionFlowStyle}>
              <div
                className={`${styles.templateSectionShell} ${
                  activeRecoveryLayout.templates.historyPosition === "before"
                    ? styles.templateSectionShellAfter
                    : ""
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingTemplateSection === "history") {
                    setTemplateHistoryPosition("before");
                  }
                  setDraggingTemplateSection(null);
                }}
              >
                <div
                  className={styles.templateSectionGrip}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", "workspace");
                    setDraggingTemplateSection("workspace");
                  }}
                  onDragEnd={() => setDraggingTemplateSection(null)}
                >
                  <span />
                  <span />
                  <span />
                </div>
                <div
              ref={templatesWorkspaceRef}
              className={`${styles.templatesMetaGrid} ${
                activeRecoveryLayout.templates.workspaceMode === "column"
                  ? styles.templatesMetaGridStacked
                  : ""
              }`}
              style={templatesWorkspaceStyle}
            >
              <article
                ref={templateComposerWindowRef}
                className={`${styles.botStepCard} ${styles.templateWorkspaceCard} ${styles.templateWindowResizable} ${
                  draggingTemplatePane === "catalog" ? styles.templateWorkspaceCardDragTarget : ""
                }`}
                style={{
                  ...templateWindowStyleById.composer,
                  order: composerPaneOrder,
                  ...(activeRecoveryLayout.templates.workspaceMode === "row"
                    ? { gridColumn: isCatalogLeadPane ? "3" : "1" }
                    : {}),
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingTemplatePane && draggingTemplatePane !== "composer") {
                    setTemplateLeadPane("composer");
                  }
                  setDraggingTemplatePane(null);
                }}
              >
                <div className={styles.botStepHeader}>
                  <div>
                    <h4>Criar template na Meta</h4>
                    <p>Monte e envie.</p>
                  </div>
                  <div
                    className={styles.templatePaneGrip}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", "composer");
                      setDraggingTemplatePane("composer");
                    }}
                    onDragEnd={() => setDraggingTemplatePane(null)}
                    title="Arraste para trocar este painel de lado"
                  >
                    <span />
                    <span />
                    <span />
                  </div>
                </div>

                <div
                  ref={templateComposerLayoutRef}
                  className={`${styles.templateComposerLayout} ${
                    activeRecoveryLayout.templates.composerMode === "column"
                      ? styles.templateComposerLayoutStacked
                      : ""
                  }`}
                  style={templateComposerLayoutStyle}
                >
                  <div className={styles.templateComposerForm}>
                <div className={styles.templateMetaHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>Modo Meta</p>
                    <h5>Conteudos do modelo</h5>
                  </div>
                  <div className={styles.templateMetaHeaderPills}>
                    <span className={styles.templateMetaPill}>Idioma fixo: pt_BR</span>
                    <span className={styles.templateMetaPill}>
                      Variavel no editor: {templateComposer.variableMode === "NAME" ? "Nome" : "Numero"}
                    </span>
                  </div>
                </div>

                <div className={styles.templateMetaTopGrid}>
                  <label className={styles.fieldBlock}>
                    <span>Nome interno</span>
                    <input
                      className="field"
                      placeholder="ex: cobranca_inicial_hbx_v2"
                      value={templateComposer.name}
                      onChange={(event) =>
                        updateTemplateComposer((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                    <small className={styles.templateFieldMeta}>
                      Vai para a Meta como <code>{normalizedComposerName || "nome_do_template"}</code>
                    </small>
                  </label>
                  <label className={styles.fieldBlock}>
                    <span>Categoria</span>
                    <select
                      className="field"
                      value={templateComposer.category}
                      onChange={(event) =>
                        updateTemplateComposer((current) => ({
                          ...current,
                          category: event.target.value as RecoveryTemplateComposer["category"],
                        }))
                      }
                    >
                      <option value="UTILITY">UTILITY</option>
                      <option value="MARKETING">MARKETING</option>
                      <option value="AUTHENTICATION">AUTHENTICATION</option>
                    </select>
                  </label>
                  <label className={styles.fieldBlock}>
                    <span>Tipo de variavel</span>
                    <select
                      className="field"
                      value={templateComposer.variableMode}
                      onChange={(event) =>
                        updateTemplateComposer((current) => ({
                          ...current,
                          variableMode: event.target.value as RecoveryTemplateComposer["variableMode"],
                          enforceRecoveryVars:
                            event.target.value === "NAME" ? current.enforceRecoveryVars : false,
                        }))
                      }
                    >
                      <option value="NAME">Nome</option>
                      <option value="NUMBER">Numero</option>
                    </select>
                    <small className={styles.templateFieldMeta}>
                      {templateComposer.variableMode === "NAME"
                        ? "Use {{empresa}}, {{funcionario}} e {{cliente}}."
                        : "Use {{1}}, {{2}} e {{3}}."}
                    </small>
                  </label>
                  <label className={styles.fieldBlock}>
                    <span>Logo / cabecalho</span>
                    <select
                      className="field"
                      value={templateComposer.headerFormat}
                      onChange={(event) =>
                        updateTemplateComposer((current) => ({
                          ...current,
                          headerFormat: event.target.value as RecoveryTemplateComposer["headerFormat"],
                        }))
                      }
                    >
                      <option value="NONE">Sem cabecalho</option>
                      <option value="TEXT">Texto</option>
                      <option value="IMAGE">Imagem / logotipo</option>
                      <option value="DOCUMENT">Documento</option>
                      <option value="VIDEO">Video</option>
                    </select>
                  </label>
                </div>

                <div className={styles.templateMetaComplianceCard}>
                  <div className={styles.templateMetaComplianceHeader}>
                    <strong>Checklist Meta em tempo real</strong>
                  </div>
                  <div className={styles.templateMetaComplianceGrid}>
                    {composerComplianceRows.map((item) => (
                      <div
                        key={item.label}
                        className={`${styles.templateMetaComplianceItem} ${
                          item.state === "ok"
                            ? styles.templateMetaComplianceItemOk
                            : styles.templateMetaComplianceItemError
                        }`}
                      >
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {templateComposer.headerFormat === "TEXT" ? (
                  <label className={styles.fieldBlock}>
                    <span>Texto do cabecalho</span>
                    <input
                      className="field"
                      placeholder="ex: Recovery"
                      value={templateComposer.headerText}
                      onChange={(event) =>
                        updateTemplateComposer((current) => ({
                          ...current,
                          headerText: event.target.value,
                        }))
                      }
                    />
                    <small className={styles.templateFieldMeta}>
                      Ate 60 caracteres e sem variaveis.
                    </small>
                  </label>
                ) : null}

                {templateComposer.headerFormat === "IMAGE" ||
                templateComposer.headerFormat === "DOCUMENT" ||
                templateComposer.headerFormat === "VIDEO" ? (
                  <>
                    {templateComposer.headerFormat === "IMAGE" ? (
                      <>
                        <input
                          ref={templateHeaderFileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className={styles.templateHiddenInput}
                          onChange={onTemplateHeaderFileChange}
                        />
                        <button
                          type="button"
                          className={`${styles.templateUploadZone} ${
                            templateHeaderDropActive ? styles.templateUploadZoneActive : ""
                          }`}
                          onClick={() => templateHeaderFileInputRef.current?.click()}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setTemplateHeaderDropActive(true);
                          }}
                          onDragLeave={() => setTemplateHeaderDropActive(false)}
                          onDrop={onTemplateHeaderDrop}
                          disabled={metaTemplateBusy === "upload-header"}
                        >
                          <strong>
                            {metaTemplateBusy === "upload-header"
                              ? "Enviando imagem..."
                              : "Arraste a imagem aqui ou clique para enviar"}
                          </strong>
                          <span>
                            JPG, PNG ou WEBP ate 25 MB. O HBX converte para JPG compativel, em
                            1080x1080, com logo central de ate 500x500.
                          </span>
                        </button>
                        {templateComposer.headerMediaUrl ? (
                          <div className={styles.templateUploadPreview}>
                            <img
                              src={templateComposer.headerMediaUrl}
                              alt="Preview do cabecalho"
                            />
                            <div>
                              <strong>Preview</strong>
                              <p>A mesma URL sera usada pelo HBX no envio do template.</p>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    <div className={styles.registerInlineFields}>
                      <label className={styles.fieldBlock}>
                        <span>Handle Meta</span>
                        <input
                          className="field"
                          placeholder="ex: 4::YX..."
                          value={templateComposer.headerHandle}
                          onChange={(event) =>
                            updateTemplateComposer((current) => ({
                              ...current,
                              headerHandle: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className={styles.fieldBlock}>
                        <span>URL da imagem</span>
                        <input
                          className="field"
                          placeholder="https://..."
                          value={templateComposer.headerMediaUrl}
                          onChange={(event) =>
                            updateTemplateComposer((current) => ({
                              ...current,
                              headerMediaUrl: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.templateHelperCard}>
                      <strong>Como funciona agora</strong>
                      {templateComposer.headerFormat === "IMAGE" ? (
                        <>
                          <p>1. Envie a imagem aqui pelo HBX.</p>
                          <p>2. O sistema preenche o <code>header_handle</code> e a URL automaticamente.</p>
                          <p>3. O logo sera centralizado em 1080x1080, com area segura menor para evitar corte.</p>
                          <p>4. Prefira simbolo + nome. Textos pequenos no logo tendem a sumir no chat.</p>
                        </>
                      ) : (
                        <>
                          <p>1. Envie o arquivo correspondente na Meta.</p>
                          <p>2. Cole aqui o <code>header_handle</code>.</p>
                          <p>3. Informe a URL publica usada pelo HBX no envio.</p>
                        </>
                      )}
                    </div>
                  </>
                ) : null}

                <label className={styles.fieldBlock}>
                  <span>Mensagem (BODY)</span>
                  <textarea
                    className="field"
                    value={templateComposer.bodyText}
                    onChange={(event) =>
                      updateTemplateComposer((current) => ({ ...current, bodyText: event.target.value }))
                    }
                  />
                </label>
                <label className={styles.fieldBlock}>
                  <span>Rodape (opcional)</span>
                  <input
                    className="field"
                    value={templateComposer.footerText}
                    onChange={(event) =>
                      updateTemplateComposer((current) => ({ ...current, footerText: event.target.value }))
                    }
                  />
                </label>
                <label className={styles.fieldBlock}>
                  <span>Botoes rapidos (1 por linha, max 3)</span>
                  <textarea
                    className="field"
                    value={templateComposer.buttonsText}
                    onChange={(event) =>
                      updateTemplateComposer((current) => ({ ...current, buttonsText: event.target.value }))
                    }
                  />
                </label>

                <div className={styles.interactionBadgeRow}>
                  {composerVariables.map((variable) => (
                    <span key={`composer-var-${variable}`} className={`${styles.stateBadge} ${styles.stateWaiting}`}>
                      {`{{${variable}}}`}
                    </span>
                  ))}
                </div>

                {composerVariableMap.length > 0 ? (
                  <div className={styles.templateVariableMap}>
                    <strong>
                      {templateComposer.variableMode === "NAME"
                        ? "Mapa de variaveis HBX -> Meta"
                        : "Variaveis detectadas no body"}
                    </strong>
                    <div className={styles.templateVariableMapGrid}>
                      {composerVariableMap.map((item) => (
                        <span key={`${item.friendly}-${item.meta}`} className={styles.templateVariableMapItem}>
                          {templateComposer.variableMode === "NAME"
                            ? `${item.friendly} = ${item.meta}`
                            : item.meta}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className={styles.interactionBadgeRow}>
                  <label className={styles.inlineToggle}>
                    <input
                      type="checkbox"
                      checked={templateComposer.activateInHbx}
                      onChange={(event) =>
                        updateTemplateComposer((current) => ({
                          ...current,
                          activateInHbx: event.target.checked,
                        }))
                      }
                    />
                    Ativar no HBX apos criar
                  </label>
                  <label className={styles.inlineToggle}>
                    <input
                      type="checkbox"
                      checked={templateComposer.enforceRecoveryVars}
                      disabled={templateComposer.variableMode !== "NAME"}
                      onChange={(event) =>
                        updateTemplateComposer((current) => ({
                          ...current,
                          enforceRecoveryVars: event.target.checked,
                        }))
                      }
                    />
                    Validar variaveis do Recovery
                  </label>
                </div>

                {templateComposer.enforceRecoveryVars && missingRecoveryVars.length > 0 ? (
                  <div className="alert alert-error">
                    Variaveis faltando para template inicial:{" "}
                    {missingRecoveryVars.map((item) => `{{${item}}}`).join(", ")}
                  </div>
                ) : null}
                {composerBlockingIssues.length > 0 ? (
                  <div className={styles.templateMetaIssueList}>
                    {composerBlockingIssues.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : null}
                {templateComposerError ? (
                  <div className="alert alert-error">{templateComposerError}</div>
                ) : null}

                <div className={styles.heroActions}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={createMetaTemplate}
                    disabled={metaTemplateBusy === "create" || !normalizedComposerName || composerBlockingIssues.length > 0}
                  >
                    {metaTemplateBusy === "create" ? "Criando..." : "Criar template na Meta"}
                  </button>
                </div>
                  </div>

                  {activeRecoveryLayout.templates.composerMode === "row" ? (
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      className={styles.templateComposerSplitter}
                      onPointerDown={(event) =>
                        beginLayoutResize(
                          "composer",
                          "row",
                          templateComposerLayoutRef.current,
                          event,
                        )
                      }
                    />
                  ) : null}

                </div>
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  className={styles.templateCatalogResizeHandle}
                  onPointerDown={(event) =>
                    beginLayoutResize("composerCard", "column", templateComposerLayoutRef.current, event)
                  }
                >
                  <span />
                </div>
                {renderTemplateWindowResizeHandles("composer")}
              </article>

              {activeRecoveryLayout.templates.workspaceMode === "row" ? (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  className={styles.templatesPaneSplitter}
                  style={{
                    order: 2,
                    ...(activeRecoveryLayout.templates.workspaceMode === "row"
                      ? { gridColumn: "2" }
                      : {}),
                  }}
                  onPointerDown={(event) =>
                    beginLayoutResize(
                      "workspace",
                      "row",
                      templatesWorkspaceRef.current,
                      event,
                    )
                  }
                />
              ) : null}

              <article
                ref={templateCatalogWindowRef}
                className={`${styles.botStepCard} ${styles.templateWorkspaceCard} ${styles.templateWindowResizable} ${
                  draggingTemplatePane === "composer" ? styles.templateWorkspaceCardDragTarget : ""
                }`}
                style={{
                  ...templateWindowStyleById.catalog,
                  order: catalogPaneOrder,
                  ...(activeRecoveryLayout.templates.workspaceMode === "row"
                    ? { gridColumn: isCatalogLeadPane ? "1" : "3" }
                    : {}),
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingTemplatePane && draggingTemplatePane !== "catalog") {
                    setTemplateLeadPane("catalog");
                  }
                  setDraggingTemplatePane(null);
                }}
              >
                <div className={styles.botStepHeader}>
                  <div>
                    <h4>Catalogo PT-BR</h4>
                    <p>Gerencie os templates ativos.</p>
                  </div>
                  <div
                    className={styles.templatePaneGrip}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", "catalog");
                      setDraggingTemplatePane("catalog");
                    }}
                    onDragEnd={() => setDraggingTemplatePane(null)}
                    title="Arraste para trocar este painel de lado"
                  >
                    <span />
                    <span />
                    <span />
                  </div>
                </div>

                {loadingMetaTemplates ? (
                  <div className={styles.flowEmpty}>Carregando templates...</div>
                ) : metaTemplates.templates.length === 0 ? (
                  <div className={styles.flowEmpty}>
                    Nenhum template encontrado. Clique em sincronizar para consultar a Meta.
                  </div>
                ) : (
                  <>
                    <div ref={templateCatalogListRef} className={styles.templateCatalogList}>
                      {metaTemplates.templates.map((template) => {
                        const view = getTemplateViewModel(template);
                        return (
                        <article
                          key={`${template.name}-${template.language}`}
                          className={`${styles.templateCatalogItem} ${styles.templateWindowResizable}`}
                        >
                        <div className={styles.templateCatalogHeader}>
                          <div>
                            <strong>{template.name}</strong>
                            <p>
                              {template.category} - {template.language}
                            </p>
                          </div>
                          <div className={styles.interactionBadgeRow}>
                            <span
                              className={`${styles.stateBadge} ${getMetaStatusBadgeClass(template.status)}`}
                            >
                              Meta: {metaStatusLabel(template.status)}
                            </span>
                            <span
                              className={`${styles.stateBadge} ${
                                template.hbxActive ? styles.statePaid : styles.stateExpired
                              }`}
                            >
                              HBX: {template.hbxActive ? "Ativo" : "Inativo"}
                            </span>
                            <span className={`${styles.stateBadge} ${styles.stateWaiting}`}>
                              {headerFormatLabel(view.headerFormat)}
                            </span>
                          </div>
                        </div>
                        {view.headerText ? (
                          <p className={styles.templateCatalogMeta}>Cabecalho: {view.headerText}</p>
                        ) : null}
                        {isMediaHeaderFormat(view.headerFormat) ? (
                          <div className={styles.templateCatalogInlineField}>
                            <label className={styles.fieldBlock}>
                              <span>URL da imagem</span>
                              <input
                                className="field"
                                placeholder="https://..."
                                value={view.headerMediaUrl || ""}
                                onChange={(event) =>
                                  updateTemplateHeaderMediaUrl(
                                    template.name,
                                    template.language,
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <div className={styles.heroActions}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  saveTemplateHeaderMediaUrl(template.name, template.language)
                                }
                                disabled={
                                  metaTemplateBusy === `config:${template.name}:${template.language}`
                                }
                              >
                                {metaTemplateBusy === `config:${template.name}:${template.language}`
                                  ? "Salvando..."
                                  : "Salvar URL"}
                              </button>
                            </div>
                            {!String(view.headerMediaUrl || "").trim() ? (
                              <div className="alert alert-error">
                                Informe a URL publica da imagem para o HBX conseguir enviar.
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <p className={styles.templateCatalogText}>
                          {view.bodyText || "Sem body retornado pela Meta."}
                        </p>
                        {view.footerText ? (
                          <p className={styles.templateCatalogMeta}>Rodape: {view.footerText}</p>
                        ) : null}
                        {view.buttons.length > 0 ? (
                          <div className={styles.interactionBadgeRow}>
                            {view.buttons.map((button, index) => (
                              <span
                                key={`${template.name}-${template.language}-${button.type}-${index}`}
                                className={`${styles.stateBadge} ${styles.stateBot}`}
                              >
                                {button.text || button.type}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className={styles.interactionBadgeRow}>
                          {view.variableOrder.map((variable) => (
                            <span
                              key={`${template.name}-${template.language}-var-${variable}`}
                              className={`${styles.stateBadge} ${styles.stateWaiting}`}
                            >
                              {`{{${variable}}}`}
                            </span>
                          ))}
                        </div>
                        {Object.keys(view.variableExamples).length > 0 ? (
                          <div className={styles.interactionBadgeRow}>
                            {Object.entries(view.variableExamples).map(([variable, example]) => (
                              <span
                                key={`${template.name}-${template.language}-example-${variable}`}
                                className={`${styles.stateBadge} ${styles.stateWaiting}`}
                              >
                                {`{{${variable}}}: ${example}`}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {template.rejectedReason ? (
                          <div className="alert alert-error">Motivo Meta: {template.rejectedReason}</div>
                        ) : null}
                        <div className={`${styles.heroActions} ${styles.templateActionRow}`}>
                          <button
                            type="button"
                            className={`btn btn-sm ${
                              template.hbxActive ? "btn-danger" : "btn-secondary"
                            }`}
                            onClick={() =>
                              toggleTemplateHbxActivation(
                                template.name,
                                template.language,
                                !template.hbxActive,
                              )
                            }
                            disabled={
                              metaTemplateBusy === `toggle:${template.name}:${template.language}`
                            }
                          >
                            {template.hbxActive ? "Desativar no HBX" : "Ativar no HBX"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              {
                                const variableMode = inferTemplateVariableMode(
                                  view.variableOrder.length > 0
                                    ? view.variableOrder
                                    : extractTemplateVariablesInOrder(view.bodyText || ""),
                                );
                                setTemplateComposer({
                                  ...DEFAULT_TEMPLATE_COMPOSER,
                                  name: template.name,
                                  category:
                                    template.category === "MARKETING" ||
                                    template.category === "AUTHENTICATION"
                                      ? (template.category as RecoveryTemplateComposer["category"])
                                      : "UTILITY",
                                  language: template.language || "pt_BR",
                                  variableMode,
                                  headerFormat: view.headerFormat,
                                  headerText: view.headerText || "",
                                  headerHandle: view.headerHandle || "",
                                  headerMediaUrl: view.headerMediaUrl || "",
                                  bodyText: view.bodyText || DEFAULT_TEMPLATE_COMPOSER.bodyText,
                                  footerText: view.footerText || "",
                                  buttonsText: view.buttons
                                    .map((button) => String(button.text || "").trim())
                                    .filter((button) => button.length > 0)
                                    .join("\n"),
                                  activateInHbx: true,
                                  enforceRecoveryVars: variableMode === "NAME",
                                });
                                setTemplateComposerPreviewVisible(true);
                              }
                            }
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => deleteMetaTemplate(template)}
                            disabled={
                              metaTemplateBusy === `delete:${template.name}:${template.language}`
                            }
                          >
                            {metaTemplateBusy === `delete:${template.name}:${template.language}`
                              ? "Excluindo..."
                              : "Excluir"}
                          </button>
                        </div>
                        </article>
                      );})}
                    </div>
                    <div
                      role="separator"
                      aria-orientation="horizontal"
                      className={styles.templateCatalogResizeHandle}
                      onPointerDown={(event) =>
                        beginLayoutResize("catalog", "column", templateCatalogListRef.current, event)
                      }
                    >
                      <span />
                    </div>
                  </>
                )}
                {renderTemplateWindowResizeHandles("catalog")}
              </article>
                </div>
              </div>

              <div
                className={`${styles.templateSectionShell} ${
                  activeRecoveryLayout.templates.historyPosition === "before"
                    ? styles.templateSectionShellBefore
                    : ""
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingTemplateSection === "workspace") {
                    setTemplateHistoryPosition("after");
                  }
                  setDraggingTemplateSection(null);
                }}
              >
                <div
                  className={styles.templateSectionGrip}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", "history");
                    setDraggingTemplateSection("history");
                  }}
                  onDragEnd={() => setDraggingTemplateSection(null)}
                >
                  <span />
                  <span />
                  <span />
                </div>

            <article
              ref={templateHistoryWindowRef}
              className={`${styles.botStepCard} ${styles.templateWindowResizable}`}
              style={templateWindowStyleById.history}
            >
              <div className={styles.botStepHeader}>
                <div>
                  <h4>Historico de aprovacao/reprovacao</h4>
                  <p>Auditoria das mudancas de status recebidas da Meta na sincronizacao.</p>
                </div>
              </div>
              {metaTemplates.history.length === 0 ? (
                <div className={styles.flowEmpty}>Sem mudancas de status registradas ate agora.</div>
              ) : (
                <div className={styles.templateHistoryList}>
                  {metaTemplates.history.slice(0, 30).map((item) => (
                    <div key={item.id} className={styles.templateHistoryRow}>
                      <strong>
                        {item.name} ({item.language})
                      </strong>
                      <span>
                        {item.previousStatus || "Sem status anterior"} {"->"} {item.nextStatus}
                      </span>
                      <span>{formatDateTime(item.changedAt)}</span>
                      {item.reason ? <span>Motivo: {item.reason}</span> : null}
                    </div>
                  ))}
                </div>
              )}
              {renderTemplateWindowResizeHandles("history")}
            </article>
              </div>
            </div>

            <div className={styles.layoutSaveBar}>
                <button
                  type="button"
                  className={styles.layoutResetButton}
                  onClick={restoreRecoveryLayoutConfig}
                  disabled={savingRecoveryLayout}
                >
                  Restaurar layout
                </button>
                <button
                  type="button"
                  className={`${styles.layoutSaveButton} ${
                    !savingRecoveryLayout ? styles.layoutSaveButtonDirty : ""
                  }`}
                  onClick={saveRecoveryLayoutConfig}
                  disabled={savingRecoveryLayout}
                >
                  {savingRecoveryLayout ? "Salvando..." : "Salvar layout"}
                </button>
            </div>

            {templateComposerPreviewVisible ? (
              <aside
                ref={templatePreviewWindowRef}
                className={`${styles.templatePreviewPanel} ${styles.templatePreviewPopup} ${styles.templateWindowResizable}`}
                style={templateWindowStyleById.preview}
              >
                <div className={`${styles.templatePreviewHeader} ${styles.templatePreviewWindowHeader}`}>
                  <div>
                    <span className={styles.templatePreviewEyebrow}>Preview ao vivo</span>
                    <strong>Como a mensagem tende a aparecer</strong>
                  </div>
                  <div className={styles.templatePreviewHeaderActions}>
                    <span className={`${styles.stateBadge} ${styles.stateWaiting}`}>
                      {templateComposer.language || "pt_BR"}
                    </span>
                    <button
                      type="button"
                      className={styles.templatePreviewCloseButton}
                      onClick={() => setTemplateComposerPreviewVisible(false)}
                      aria-label="Fechar preview"
                    >
                      Fechar
                    </button>
                  </div>
                </div>

                <div className={styles.templatePhoneFrame}>
                  <div className={styles.templatePhoneTopBar}>
                    <span>WhatsApp</span>
                    <strong>{templateComposer.name || "novo_template_meta"}</strong>
                  </div>
                  <div className={styles.templateChatCanvas}>
                    <div className={styles.templateMessageBubble}>
                      {templateComposer.headerFormat === "IMAGE" ? (
                        templateComposer.headerMediaUrl ? (
                          <img
                            className={styles.templateMessageMedia}
                            src={templateComposer.headerMediaUrl}
                            alt="Cabecalho visual do template"
                          />
                        ) : (
                          <div className={styles.templateMessageMediaPlaceholder}>
                            <strong>Logotipo / imagem</strong>
                            <span>Envie a arte para visualizar aqui</span>
                          </div>
                        )
                      ) : null}
                      {templateComposer.headerFormat === "DOCUMENT" ? (
                        <div className={styles.templateAttachmentCard}>
                          <strong>Documento do cabecalho</strong>
                          <span>O cliente vera um anexo antes da mensagem.</span>
                        </div>
                      ) : null}
                      {templateComposer.headerFormat === "VIDEO" ? (
                        <div className={styles.templateAttachmentCard}>
                          <strong>Video do cabecalho</strong>
                          <span>O template exibira um video no topo.</span>
                        </div>
                      ) : null}
                      {templateComposer.headerFormat === "TEXT" && previewHeaderText ? (
                        <div className={styles.templateMessageHeaderText}>{previewHeaderText}</div>
                      ) : null}

                      <div className={styles.templateMessageBody}>{previewBodyText}</div>
                      {previewFooterText ? (
                        <div className={styles.templateMessageFooter}>{previewFooterText}</div>
                      ) : null}

                      {composerPreviewButtons.length > 0 ? (
                        <div className={styles.templateMessageButtons}>
                          {composerPreviewButtons.map((button) => (
                            <button
                              key={`preview-popup-button-${button}`}
                              type="button"
                              className={styles.templateMessageButton}
                              disabled
                            >
                              {button}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <span className={styles.templateMessageTime}>{previewTimeLabel}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.templatePreviewLegend}>
                  <strong>Variaveis usadas no preview</strong>
                  <div className={styles.templatePreviewVariables}>
                    {composerVariables.length > 0 ? (
                      composerVariables.map((variable) => (
                        <span key={`preview-popup-var-${variable}`} className={styles.templatePreviewVariable}>
                          {`{{${variable}}}`} ={" "}
                          {previewTemplateSamples[variable] || `[${variable.toUpperCase()}]`}
                        </span>
                      ))
                    ) : (
                      <span className={styles.templatePreviewVariable}>
                        Sem variaveis detectadas no body.
                      </span>
                    )}
                  </div>
                </div>
                {renderTemplateWindowResizeHandles("preview")}
              </aside>
            ) : null}
              </>
            ) : null}

            {typeof document !== "undefined" && templateWindowOrganizerOpen
              ? createPortal(
                  <div className={styles.templateWindowOrganizerOverlay}>
                    <div className={styles.templateWindowOrganizerDialog}>
                      <div className={styles.templateWindowOrganizerHeader}>
                        <div>
                          <span className={styles.templateWindowOrganizerEyebrow}>Modo compacto</span>
                          <h3>Reorganize as janelas do Templates Meta</h3>
                          <p>Mova para a esquerda ou direita, ou arraste um card sobre o outro.</p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={closeTemplateWindowOrganizer}
                        >
                          Fechar
                        </button>
                      </div>

                      <div className={styles.templateWindowOrganizerGrid}>
                        {templateWindowOrganizerOrder.map((windowId, index) => (
                          <div
                            key={`organizer-${windowId}`}
                            className={`${styles.templateWindowOrganizerCard} ${
                              draggingTemplateWindowId === windowId
                                ? styles.templateWindowOrganizerCardDragging
                                : ""
                            }`}
                            draggable
                            onDragStart={() => setDraggingTemplateWindowId(windowId)}
                            onDragEnd={() => setDraggingTemplateWindowId(null)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (!draggingTemplateWindowId || draggingTemplateWindowId === windowId) {
                                setDraggingTemplateWindowId(null);
                                return;
                              }
                              setTemplateWindowOrganizerOrder((current) =>
                                swapTemplateWindowOrder(current, draggingTemplateWindowId, windowId),
                              );
                              setDraggingTemplateWindowId(null);
                            }}
                          >
                            <span className={styles.templateWindowOrganizerIndex}>
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <strong>{TEMPLATE_WINDOW_LABELS[windowId]}</strong>
                            <p>{TEMPLATE_WINDOW_DESCRIPTIONS[windowId]}</p>
                            <div className={styles.templateWindowOrganizerActions}>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => moveTemplateWindowInOrganizer(windowId, "left")}
                                disabled={index === 0}
                              >
                                Esquerda
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => moveTemplateWindowInOrganizer(windowId, "right")}
                                disabled={index === templateWindowOrganizerOrder.length - 1}
                              >
                                Direita
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className={styles.templateWindowOrganizerFooter}>
                        <span>Ao concluir, o HBX remove os tamanhos presos e reencaixa os paineis.</span>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={applyTemplateWindowOrganizer}
                        >
                          Concluido
                        </button>
                      </div>
                    </div>
                  </div>,
                  document.body,
                )
              : null}
          </section>
        ) : null}

        {renderedTab === "bot" ? (
          <>
        <section className={`panel ${styles.sectionCard} ${styles.botEditorPanel}`}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>WhatsApp interativo</p>
              <h2 className={styles.sectionTitle}>Builder visual do bot</h2>
              <p className={styles.sectionDescription}>
                Fluxo completo, template inicial como primeiro no, preview navegavel e bibliotecas separadas sem configuracao legada brigando com a experiencia.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={saveBotConfig}
              disabled={savingBotConfig || loadingBotConfig}
            >
              {savingBotConfig ? "Salvando..." : "Salvar editor"}
            </button>
          </div>

          {loadingBotConfig ? (
            <div className={styles.flowEmpty}>Carregando editor do bot...</div>
          ) : (
            <div className={styles.botFlowLayout}>
              <RecoveryBotStudio
                botConfig={botConfig}
                loadingBotConfig={loadingBotConfig}
                savingBotConfig={savingBotConfig}
                botActionOptions={botActionOptions}
                templateStart={botStudioTemplateStart}
                templateOptions={botStudioTemplateOptions}
                startTemplateReady={selectedStartTemplateIssues.length === 0}
                onSelectTemplateOption={(templateId) => {
                  const [name, language] = templateId.split("::");
                  void setActiveStartTemplate(name || "", language || "pt_BR");
                }}
                onSave={saveBotConfig}
                onBotTextChange={handleBotTextChange}
                onAppendVariable={appendVariableToTextField}
                onUpdateButton={handleSectionButtonChange}
                onAddButton={addSectionButton}
                onRemoveButton={removeSectionButton}
                onUpdateVariableGuide={handleVariableGuideChange}
                onUpdateActionGuide={updateActionGuide}
                onAddCustomActionGuide={addCustomActionGuide}
                onRemoveCustomActionGuide={removeCustomActionGuide}
                onUpdateRoutingRule={handleRoutingRuleChange}
              />
            </div>
          )}
        </section>
          </>
        ) : null}

        {renderedTab === "payments" ? (
          <section className={`panel ${styles.sectionCard} ${styles.paymentHistoryPanel}`}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Atualizacao ao vivo</p>
                <h2 className={styles.sectionTitle}>Historico de pagamentos</h2>
              </div>
              <div className={styles.historyMonthWrap}>
                <label htmlFor="payment-history-month">Mes de referencia</label>
                <input
                  id="payment-history-month"
                  className="field"
                  type="month"
                  value={paymentMonth}
                  onChange={(event) => setPaymentMonth(event.target.value)}
                />
              </div>
            </div>

            <div className={styles.paymentStatusCards}>
              <button
                type="button"
                className={`${styles.paymentStatusCard} ${
                  paymentFilter === "paid" ? styles.paymentStatusCardActive : ""
                }`}
                onClick={() => setPaymentFilter("paid")}
              >
                <span>Pago</span>
                <strong>{paymentSummary.counters.paid}</strong>
              </button>
              <button
                type="button"
                className={`${styles.paymentStatusCard} ${
                  paymentFilter === "in_progress" ? styles.paymentStatusCardActive : ""
                }`}
                onClick={() => setPaymentFilter("in_progress")}
              >
                <span>Em andamento</span>
                <strong>{paymentSummary.counters.in_progress}</strong>
              </button>
              <button
                type="button"
                className={`${styles.paymentStatusCard} ${
                  paymentFilter === "finalized" ? styles.paymentStatusCardActive : ""
                }`}
                onClick={() => setPaymentFilter("finalized")}
              >
                <span>Finalizado</span>
                <strong>{paymentSummary.counters.finalized}</strong>
              </button>
              <button
                type="button"
                className={`${styles.paymentStatusCard} ${
                  paymentFilter === "cancelled" ? styles.paymentStatusCardActive : ""
                }`}
                onClick={() => setPaymentFilter("cancelled")}
              >
                <span>Cancelado</span>
                <strong>{paymentSummary.counters.cancelled}</strong>
              </button>
            </div>

            <div className={styles.paymentTotalsGrid}>
              <article className={styles.paymentTotalCard}>
                <span>Total aprovado</span>
                <strong>{formatCurrency(paymentSummary.totals.totalApprovedAmount)}</strong>
              </article>
              <article className={styles.paymentTotalCard}>
                <span>Taxa 3,00%</span>
                <strong>{formatCurrency(paymentSummary.totals.totalCommissionAmount)}</strong>
              </article>
              <article className={styles.paymentTotalCard}>
                <span>Qtd. aprovada</span>
                <strong>{paymentSummary.totals.totalApprovedCount} cobrancas</strong>
              </article>
              <article className={styles.paymentTotalCard}>
                <span>Pendentes</span>
                <strong>{paymentSummary.totals.pendingCount} cobrancas</strong>
              </article>
            </div>

            <div className={styles.paymentBillingGrid}>
              <article className={styles.paymentBillingCard}>
                <span>Aguardando pagamento</span>
                <strong>{formatCurrency(paymentSummary.billing.pendingAmount)}</strong>
              </article>
              <article className={styles.paymentBillingCard}>
                <span>Faturamento bruto</span>
                <strong>{formatCurrency(paymentSummary.billing.grossAmount)}</strong>
              </article>
              <article className={styles.paymentBillingCard}>
                <span>Comissao 3,00%</span>
                <strong>{formatCurrency(paymentSummary.billing.commissionAmount)}</strong>
              </article>
              <article className={styles.paymentBillingCard}>
                <span>Faturamento liquido</span>
                <strong>{formatCurrency(paymentSummary.billing.netAmount)}</strong>
              </article>
            </div>

            <div className={styles.paymentHistoryList}>
              {loadingPaymentHistory ? (
                <div className={styles.paymentEmpty}>Carregando historico...</div>
              ) : paymentSummary.records.length === 0 ? (
                <div className={styles.paymentEmpty}>
                  Nenhuma cobranca encontrada para esse filtro. Ajuste o mes ou aguarde novos pagamentos.
                </div>
              ) : (
                paymentSummary.records.map((payment) => (
                  <article key={payment.id} className={styles.paymentRowCard}>
                    <div>
                      <p className={styles.historyTitle}>{payment.customerName}</p>
                      <p className={styles.historyMeta}>
                        {payment.description} | {payment.statusLabel}
                      </p>
                      <p className={styles.historyMeta}>
                        Criada em{" "}
                        {payment.createdAt
                          ? new Date(payment.createdAt).toLocaleString("pt-BR")
                          : "-"}
                      </p>
                    </div>
                    <div className={styles.paymentRowAside}>
                      <strong>{formatCurrency(payment.amount)}</strong>
                      {payment.canRefund ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => refundPayment(payment.id)}
                          disabled={refundingPaymentId === payment.id}
                        >
                          {refundingPaymentId === payment.id ? "Estornando..." : "Estornar"}
                        </button>
                      ) : (
                        <span className={styles.historyStatus}>{payment.statusLabel}</span>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : null}

        {renderedTab === "messages" ? (
          <ConversationWorkspaceShell
            moduleLabel="Recovery"
            tenantId={String(currentUserProfile?.company?.id || "tenant-default")}
            role={String(currentUserProfile?.role || "USER")}
            userId={String(
              currentUserProfile?.id ||
                currentUserProfile?.username ||
                currentUserProfile?.email ||
                "anonymous",
            )}
            isMaster={Boolean(currentUserProfile?.isSystemMaster)}
            remountSignature={`${interactionsQueue}:${loadingInteractions ? "loading" : "ready"}:${displayedInteractionConversations.length}:${interactionDetail?.conversationId || "none"}:${visibleInteractionMessages.length}`}
            panels={recoveryWorkspacePanels}
            components={recoveryWorkspaceComponents}
            className={styles.workspaceDockShell}
            toolbarSlot={
              <ConversationQueueFilterBar
                value={interactionsQueue}
                onChange={setInteractionsQueue}
              />
            }
          />
        ) : null}

        {/*
          <section className={`panel ${styles.sectionCard} ${styles.interactionsPanel}`}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Inbox de cobranca</p>
                <h2 className={styles.sectionTitle}>Mensagens de inadimplentes</h2>
                <p className={styles.sectionDescription}>
                  Fluxo hibrido BOT + HUMANO com acoes rapidas, rastreabilidade completa e painel financeiro.
                </p>
              </div>
              <div className={styles.interactionsHeaderStats}>
                <span
                  className={`${styles.humanQueueStat} ${
                    interactionSummary.pendingHumanCount > 0 ? styles.humanQueueStatActive : ""
                  }`}
                >
                  Pendencias humanas: {interactionSummary.pendingHumanCount}
                </span>
                {interactionDetail ? (
                  <span className="badge">
                    Etapa: {mapRecoveryFlowStepLabel(interactionDetail.currentStep)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className={styles.interactionsFilter}>
              <button
                type="button"
                className={`btn btn-sm ${interactionsQueue === "all" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setInteractionsQueue("all")}
              >
                Todas as conversas
              </button>
              <button
                type="button"
                className={`btn btn-sm ${interactionsQueue === "closed" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setInteractionsQueue("closed")}
              >
                Conversas encerradas
              </button>
              <button
                type="button"
                className={`btn btn-sm ${interactionsQueue === "blocked" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setInteractionsQueue("blocked")}
              >
                Clientes bloqueados
              </button>
              <div className={styles.interactionsRefreshStatus} aria-live="polite">
                <span
                  className={`${styles.interactionsRefreshSpinner} ${
                    refreshingInteractions ? styles.interactionsRefreshSpinnerActive : ""
                  }`}
                  aria-hidden="true"
                >
                  <span />
                  <span />
                </span>
                <span>
                  {refreshingInteractions ? "Atualizando silenciosamente..." : "Atualizacao continua ativa"}
                </span>
              </div>
            </div>

            {humanAttentionFeed.length > 0 ? (
              <div className={styles.humanAttentionFeed}>
                {humanAttentionFeed.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.humanAttentionFeedItem}
                    onClick={() => openHumanAttentionConversation(item.conversationId)}
                  >
                    <div>
                      <p className={styles.humanAttentionFeedTitle}>
                        {item.kind === "human_queue" ? "Aguardando humano" : "Nova mensagem"}
                      </p>
                      <p className={styles.humanAttentionFeedMeta}>{item.moduleLabel}</p>
                      <strong>{item.customerName}</strong>
                      <p className={styles.humanAttentionFeedMeta}>{item.phone}</p>
                      <p className={styles.humanAttentionFeedPreview}>{item.preview}</p>
                    </div>
                    <span className={styles.humanAttentionFeedCount}>{item.attentionLabel}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className={styles.interactionsWorkspace}>
              <div className={styles.interactionsList}>
                {loadingInteractions ? (
                  <div className={styles.paymentEmpty}>Carregando conversas...</div>
                ) : interactionSummary.conversations.length === 0 ? (
                  <div className={styles.paymentEmpty}>Nenhuma conversa encontrada para este filtro.</div>
                ) : (
                  interactionSummary.conversations.map((item) => {
                    const active = interactionDetail?.conversationId === item.conversationId;
                    const paymentStatus = String(item.paymentStatus || "").toLowerCase();
                    const rowLinkExpired = Boolean(
                      item.paymentLinkExpiresAt &&
                        new Date(item.paymentLinkExpiresAt).getTime() < Date.now() &&
                        !["approved", "released"].includes(paymentStatus),
                    );
                    const lastSenderType = String(item.lastSourceModule || "").includes("_human")
                      ? "human"
                      : String(item.lastSourceModule || "").includes("system") ||
                          String(item.lastSourceModule || "").includes("internal")
                        ? "system"
                        : String(item.lastDirection || "").toUpperCase() === "INBOUND"
                          ? "client"
                          : "bot";
                    const rowAwaitingResponse = [
                      "aguardando_resposta_template",
                      "cobranca_menu_principal",
                      "aguardando_pagamento",
                    ].includes(String(item.currentStep || "").toLowerCase());
                    return (
                      <article
                        key={item.conversationId}
                        className={`${styles.interactionRow} ${
                          active ? styles.interactionRowActive : ""
                        }`}
                      >
                        <button
                          type="button"
                          className={styles.interactionRowButton}
                          onClick={() => loadInteractionDetail(item.conversationId)}
                          disabled={loadingInteractionDetailId === item.conversationId}
                        >
                          <div className={styles.interactionRowTop}>
                            <p className={styles.historyTitle}>{item.customerName}</p>
                            <span className={styles.interactionRowTime}>
                              {formatDateTime(item.lastAt)}
                            </span>
                          </div>
                          <p className={styles.historyMeta}>
                            {getLiveInteractionPhone({
                              conversationWhatsapp: item.conversationWhatsapp,
                              customerWhatsapp: item.customerWhatsapp,
                            })}
                          </p>
                          <p className={styles.historyMeta}>
                            {mapSenderLabel(lastSenderType, item.lastDirection)}:{" "}
                            {item.lastMessage || "-"}
                          </p>
                          <div className={styles.interactionBadgeRow}>
                            {item.botActive ? (
                              <span className={`${styles.stateBadge} ${styles.stateBot}`}>
                                BOT ativo
                              </span>
                            ) : null}
                            {item.humanAssigned || item.humanQueue ? (
                              <span className={`${styles.stateBadge} ${styles.stateHuman}`}>
                                Atendimento humano
                              </span>
                            ) : null}
                            {item.isClosed ? (
                              <span className={`${styles.stateBadge} ${styles.stateWaiting}`}>
                                Encerrada
                              </span>
                            ) : null}
                            {item.isBlocked ? (
                              <span className={`${styles.stateBadge} ${styles.stateExpired}`}>
                                Bloqueado
                              </span>
                            ) : null}
                            {item.paymentGenerated ? (
                              <span className={`${styles.stateBadge} ${styles.stateGenerated}`}>
                                Pagamento gerado
                              </span>
                            ) : null}
                            {["approved", "released"].includes(paymentStatus) ? (
                              <span className={`${styles.stateBadge} ${styles.statePaid}`}>Pago</span>
                            ) : null}
                            {rowLinkExpired ? (
                              <span className={`${styles.stateBadge} ${styles.stateExpired}`}>
                                Link expirado
                              </span>
                            ) : null}
                            {rowAwaitingResponse ? (
                              <span className={`${styles.stateBadge} ${styles.stateWaiting}`}>
                                Aguardando resposta
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </article>
                    );
                  })
                )}
              </div>

              <div className={styles.interactionDetail}>
                {!interactionDetail ? (
                  <div className={styles.paymentEmpty}>
                    Selecione uma conversa para ver timeline, estado do fluxo e acoes do operador.
                  </div>
                ) : (
                  <>
                    <div className={styles.interactionDetailHeader}>
                      <div className={styles.interactionDetailIdentity}>
                        <strong>{interactionDetail.customer.name}</strong>
                        <span>
                          {getLiveInteractionPhone({
                            conversationWhatsapp: interactionDetail.customer.conversationWhatsapp,
                            customerWhatsapp: interactionDetail.customer.whatsappNumber,
                          })}
                        </span>
                        <span>
                          Fluxo: {interactionDetail.currentFlow || "cobranca_recovery_whatsapp_hibrido"} |{" "}
                          Etapa: {mapRecoveryFlowStepLabel(interactionDetail.currentStep)}
                        </span>
                      </div>
                      <div className={styles.interactionBadgeRow}>
                        {interactionDetail.botActive ? (
                          <span className={`${styles.stateBadge} ${styles.stateBot}`}>BOT ativo</span>
                        ) : null}
                        {interactionDetail.humanAssigned ? (
                          <span className={`${styles.stateBadge} ${styles.stateHuman}`}>
                            Atendimento humano
                          </span>
                        ) : null}
                        {!interactionDetail.isBlocked &&
                        (String(interactionDetail.currentStep || "").trim().toLowerCase() ===
                          "encerrado" ||
                          ["manual_closed", "encerrado_operador"].includes(
                            String(interactionDetail.flowResult || "").trim().toLowerCase(),
                          )) ? (
                          <span className={`${styles.stateBadge} ${styles.stateWaiting}`}>
                            Conversa encerrada
                          </span>
                        ) : null}
                        {interactionDetail.isBlocked ? (
                          <span className={`${styles.stateBadge} ${styles.stateExpired}`}>
                            Cliente bloqueado
                          </span>
                        ) : null}
                        {latestPayment?.paymentUrl ? (
                          <span className={`${styles.stateBadge} ${styles.stateGenerated}`}>
                            Pagamento gerado
                          </span>
                        ) : null}
                        {paymentIsPaid ? (
                          <span className={`${styles.stateBadge} ${styles.statePaid}`}>Pago</span>
                        ) : null}
                        {linkExpired ? (
                          <span className={`${styles.stateBadge} ${styles.stateExpired}`}>
                            Link expirado
                          </span>
                        ) : null}
                        {awaitingResponse ? (
                          <span className={`${styles.stateBadge} ${styles.stateWaiting}`}>
                            Aguardando resposta
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className={styles.interactionActionBar}>
                      {interactionDetail.isBlocked ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            runInteractionAction(interactionDetail.conversationId, "unblock_interaction")
                          }
                          disabled={isInteractionBusy(
                            interactionDetail.conversationId,
                            "unblock_interaction",
                          )}
                        >
                          {isInteractionBusy(interactionDetail.conversationId, "unblock_interaction")
                            ? "Desbloqueando..."
                            : "Desbloquear cliente"}
                        </button>
                      ) : String(interactionDetail.currentStep || "").trim().toLowerCase() === "encerrado" ||
                        ["manual_closed", "encerrado_operador"].includes(
                          String(interactionDetail.flowResult || "").trim().toLowerCase(),
                        ) ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              runInteractionAction(interactionDetail.conversationId, "reopen_interaction")
                            }
                            disabled={isInteractionBusy(
                              interactionDetail.conversationId,
                              "reopen_interaction",
                            )}
                          >
                            {isInteractionBusy(interactionDetail.conversationId, "reopen_interaction")
                              ? "Reabrindo..."
                              : "Reabrir conversa"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() =>
                              runInteractionAction(interactionDetail.conversationId, "block_interaction")
                            }
                            disabled={isInteractionBusy(
                              interactionDetail.conversationId,
                              "block_interaction",
                            )}
                          >
                            {isInteractionBusy(interactionDetail.conversationId, "block_interaction")
                              ? "Bloqueando..."
                              : "Bloquear cliente"}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              runInteractionAction(interactionDetail.conversationId, "assign_human")
                            }
                            disabled={isInteractionBusy(
                              interactionDetail.conversationId,
                              "assign_human",
                            )}
                          >
                            {isInteractionBusy(interactionDetail.conversationId, "assign_human")
                              ? "Aplicando..."
                              : "Assumir atendimento"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              runInteractionAction(interactionDetail.conversationId, "pause_bot")
                            }
                            disabled={isInteractionBusy(
                              interactionDetail.conversationId,
                              "pause_bot",
                            )}
                          >
                            {isInteractionBusy(interactionDetail.conversationId, "pause_bot")
                              ? "Pausando..."
                              : "Pausar BOT"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              runInteractionAction(interactionDetail.conversationId, "resume_bot")
                            }
                            disabled={isInteractionBusy(
                              interactionDetail.conversationId,
                              "resume_bot",
                            )}
                          >
                            {isInteractionBusy(interactionDetail.conversationId, "resume_bot")
                              ? "Reativando..."
                              : "Reativar BOT"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() =>
                              runInteractionAction(
                                interactionDetail.conversationId,
                                "generate_cash_link",
                              )
                            }
                            disabled={isInteractionBusy(
                              interactionDetail.conversationId,
                              "generate_cash_link",
                            )}
                          >
                            {isInteractionBusy(interactionDetail.conversationId, "generate_cash_link")
                              ? "Gerando..."
                              : "Gerar link avista"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() =>
                              runInteractionAction(
                                interactionDetail.conversationId,
                                "generate_credit_link",
                              )
                            }
                            disabled={isInteractionBusy(
                              interactionDetail.conversationId,
                              "generate_credit_link",
                            )}
                          >
                            {isInteractionBusy(interactionDetail.conversationId, "generate_credit_link")
                              ? "Gerando..."
                              : "Pagar no credito"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              runInteractionAction(interactionDetail.conversationId, "resend_link")
                            }
                            disabled={isInteractionBusy(
                              interactionDetail.conversationId,
                              "resend_link",
                            )}
                          >
                            {isInteractionBusy(interactionDetail.conversationId, "resend_link")
                              ? "Enviando..."
                              : "Reenviar link"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              runInteractionAction(interactionDetail.conversationId, "request_proof")
                            }
                            disabled={isInteractionBusy(
                              interactionDetail.conversationId,
                              "request_proof",
                            )}
                          >
                            Solicitar comprovante
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              runInteractionAction(interactionDetail.conversationId, "mark_paid")
                            }
                            disabled={isInteractionBusy(
                              interactionDetail.conversationId,
                              "mark_paid",
                            )}
                          >
                            {isInteractionBusy(interactionDetail.conversationId, "mark_paid")
                              ? "Atualizando..."
                              : "Marcar pago manualmente"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() =>
                              runInteractionAction(interactionDetail.conversationId, "block_interaction")
                            }
                            disabled={isInteractionBusy(
                              interactionDetail.conversationId,
                              "block_interaction",
                            )}
                          >
                            {isInteractionBusy(interactionDetail.conversationId, "block_interaction")
                              ? "Bloqueando..."
                              : "Bloquear cliente"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() =>
                              runInteractionAction(
                                interactionDetail.conversationId,
                                "close_interaction",
                              )
                            }
                            disabled={isInteractionBusy(
                              interactionDetail.conversationId,
                              "close_interaction",
                            )}
                          >
                            Encerrar conversa
                          </button>
                        </>
                      )}
                    </div>

                    <div className={styles.interactionDetailGrid}>
                      <div className={styles.interactionChatPanel}>
                        <div className={styles.interactionListToolbar}>
                          <div>
                            <strong>Conversa</strong>
                            <p className={styles.historyMeta}>
                              Visualização mais próxima do WhatsApp. Eventos internos podem ser ocultados.
                            </p>
                          </div>
                          <label className={styles.interactionInlineToggle}>
                            <input
                              type="checkbox"
                              checked={showSystemMessages}
                              onChange={(event) => setShowSystemMessages(event.target.checked)}
                            />
                            <span>Mostrar eventos do sistema</span>
                          </label>
                        </div>

                        <div ref={interactionMessageListRef} className={styles.interactionMessageList}>
                        {visibleInteractionMessages.length === 0 ? (
                          <div className={styles.paymentEmpty}>
                            Nenhuma mensagem visível com o filtro atual.
                          </div>
                        ) : (
                          visibleInteractionMessages.map((message) => {
                            const senderLabel = mapSenderLabel(
                              message.senderType,
                              message.direction,
                            );
                            const senderKey = String(
                              message.senderType ||
                                (String(message.direction).toUpperCase() === "INBOUND"
                                  ? "client"
                                  : "bot"),
                            )
                              .trim()
                              .toLowerCase();
                            const senderClass =
                              senderKey === "human"
                                ? styles.interactionHuman
                                : senderKey === "client"
                                  ? styles.interactionInbound
                                  : senderKey === "system"
                                    ? styles.interactionSystem
                                    : styles.interactionOutbound;
                            const variableEntries = Object.entries(message.variables || {}).filter(
                              ([, value]) =>
                                value !== null &&
                                value !== undefined &&
                                String(value).trim() !== "",
                            );
                            return (
                              <div
                                key={message.id}
                                className={`${styles.interactionMessage} ${senderClass}`}
                                data-message-id={String(message.id)}
                                data-is-complaint={message.isComplaint ? "true" : "false"}
                              >
                                <div className={styles.messageHeader}>
                                  <span className={styles.senderTag}>{senderLabel}</span>
                                  <span className={styles.messageTypeTag}>
                                    {String(message.messageType || "text").replace(/_/g, " ")}
                                  </span>
                                </div>
                                <p>{message.body}</p>
                                {shouldShowInteractionVariables(message) && variableEntries.length > 0 ? (
                                  <div className={styles.messageVariables}>
                                    {variableEntries.slice(0, 4).map(([key, value]) => (
                                      <span key={`${message.id}-${key}`}>
                                        {key}: {String(value)}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                <span className={styles.messageMeta}>
                                  {formatDateTime(message.timestamp)}
                                  {message.isComplaint ? " | Tratativa humana" : ""}
                                </span>
                              </div>
                            );
                          })
                        )}
                        </div>

                        <div className={styles.interactionComposer}>
                          <div className={styles.interactionComposerHeader}>
                            <strong>Responder ao cliente</strong>
                            <span className={styles.historyMeta}>
                              Envia uma mensagem humana para este WhatsApp.
                            </span>
                          </div>
                          <textarea
                            className="field"
                            rows={4}
                            value={interactionReplyDraft}
                            placeholder="Digite a mensagem que deve ser enviada ao cliente..."
                            onChange={(event) => setInteractionReplyDraft(event.target.value)}
                            disabled={Boolean(interactionDetail.isBlocked) || String(interactionDetail.currentStep || "").trim().toLowerCase() === "encerrado" || ["manual_closed", "encerrado_operador"].includes(String(interactionDetail.flowResult || "").trim().toLowerCase())}
                          />
                          <div className={styles.interactionComposerActions}>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => sendInteractionReply(interactionDetail.conversationId)}
                              disabled={isInteractionBusy(
                                interactionDetail.conversationId,
                                "send_message",
                                ) || Boolean(interactionDetail.isBlocked) || String(interactionDetail.currentStep || "").trim().toLowerCase() === "encerrado" || ["manual_closed", "encerrado_operador"].includes(String(interactionDetail.flowResult || "").trim().toLowerCase())}
                            >
                              {isInteractionBusy(interactionDetail.conversationId, "send_message")
                                ? "Enviando..."
                                : "Enviar mensagem"}
                            </button>
                          </div>
                        </div>
                      </div>

                      <aside className={styles.interactionSidePanel}>
                        <article className={styles.interactionInfoCard}>
                          <h3>Resumo financeiro</h3>
                          <p>
                            <strong>Cliente:</strong>{" "}
                            {String(
                              interactionDetail.metadata?.cliente ||
                                interactionDetail.customer.name ||
                                "-",
                            )}
                          </p>
                          <p>
                            <strong>Empresa:</strong>{" "}
                            {String(
                              interactionDetail.metadata?.empresa ||
                                selectedConversationSummary?.customerName ||
                                "-",
                            )}
                          </p>
                          <p>
                            <strong>Documento:</strong>{" "}
                            {String(interactionDetail.metadata?.documento || "-")}
                          </p>
                          <p>
                            <strong>Servico:</strong>{" "}
                            {String(
                              latestPayment?.serviceDescription ||
                                interactionDetail.metadata?.descricao_servico ||
                                "Regularizacao financeira",
                            )}
                          </p>
                          <p>
                            <strong>Data do servico:</strong>{" "}
                            {(() => {
                              const rawDate =
                                latestPayment?.serviceDate ||
                                String(interactionDetail.metadata?.data_servico || "");
                              const formatted = formatDateTime(rawDate);
                              return formatted === "-" && rawDate ? rawDate : formatted;
                            })()}
                          </p>
                          <p>
                            <strong>Valor original:</strong>{" "}
                            {formatCurrency(interactionDetail.customer.openAmount || 0)}
                          </p>
                          <p>
                            <strong>Juros:</strong>{" "}
                            {latestPayment?.chargeType === "parcelado" &&
                            latestPayment.installmentCount > 1
                              ? formatCurrency(
                                  Math.max(
                                    0,
                                    latestPayment.amount -
                                      interactionDetail.customer.openAmount,
                                  ),
                                )
                              : formatCurrency(0)}
                          </p>
                          <p>
                            <strong>Checkout em cartao:</strong> definido pelo Mercado Pago no link gerado
                          </p>
                          <p>
                            <strong>Status da cobranca:</strong>{" "}
                            {mapRecoveryFlowStepLabel(interactionDetail.currentStep)}
                          </p>
                          <p>
                            <strong>Status pagamento:</strong>{" "}
                            {mapPaymentStatusLabel(latestPayment?.status)}
                          </p>
                          <p>
                            <strong>Origem link MP:</strong>{" "}
                            {latestPayment?.externalReference || "-"}
                          </p>
                          <p>
                            <strong>Ultimo link:</strong>{" "}
                            {latestPayment?.paymentUrl ? (
                              <a
                                href={latestPayment.paymentUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Abrir link
                              </a>
                            ) : (
                              "-"
                            )}
                          </p>
                          <p>
                            <strong>Vencimento link:</strong>{" "}
                            {formatDateTime(latestPayment?.linkExpiresAt)}
                          </p>
                          <p>
                            <strong>Tentativas anteriores:</strong> {paymentAttemptCount}
                          </p>
                          <p>
                            <strong>Ultima interacao:</strong>{" "}
                            {formatDateTime(interactionDetail.lastInteractionAt)}
                          </p>
                        </article>

                        <article className={styles.interactionInfoCard}>
                          <h3>Nota interna</h3>
                          <p className={styles.historyMeta}>
                            Registro interno para equipe. Nao e enviado ao cliente.
                          </p>
                          <textarea
                            className="field"
                            rows={4}
                            value={interactionNoteDraft}
                            placeholder="Ex: Cliente pediu retorno sexta as 15h."
                            onChange={(event) => setInteractionNoteDraft(event.target.value)}
                            disabled={Boolean(interactionDetail.isBlocked) || String(interactionDetail.currentStep || "").trim().toLowerCase() === "encerrado" || ["manual_closed", "encerrado_operador"].includes(String(interactionDetail.flowResult || "").trim().toLowerCase())}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              saveInteractionInternalNote(interactionDetail.conversationId)
                            }
                            disabled={isInteractionBusy(
                              interactionDetail.conversationId,
                              "internal_note",
                            ) || Boolean(interactionDetail.isBlocked) || String(interactionDetail.currentStep || "").trim().toLowerCase() === "encerrado" || ["manual_closed", "encerrado_operador"].includes(String(interactionDetail.flowResult || "").trim().toLowerCase())}
                          >
                            {isInteractionBusy(interactionDetail.conversationId, "internal_note")
                              ? "Salvando..."
                              : "Salvar nota"}
                          </button>
                        </article>
                      </aside>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        */}
        </div>

      </DashboardScaffold>

      <ClientDrawer
        open={drawerOpen}
        customer={selectedCustomer}
        onClose={closeDrawer}
        onAction={handleDrawerAction}
        busyActionId={drawerBusyAction}
        formatCurrency={formatCurrency}
      />
    </>
  );
}

