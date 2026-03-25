import type {
  InboxConversation,
  InboxRecoveryPaymentSummary,
} from "@/app/dashboard/inbox/inbox-model";
import { mapRecoveryFlowStepLabel } from "./recovery-data";
import type {
  WorkspaceBadgeDescriptor,
  WorkspaceQueueTone,
  WorkspaceSummaryDescriptor,
} from "./types";

export type AtendimentoConversationStatusTone =
  | "bot"
  | "human"
  | "recovery"
  | "blocked"
  | "closed";

export type AtendimentoConversationStatusMeta = {
  label: string;
  shortLabel: string;
  tone: AtendimentoConversationStatusTone;
};

export function isAtendimentoRecoveryConversation(
  conversation: InboxConversation,
  allowRecoveryCapability = true,
) {
  return allowRecoveryCapability && conversation.routeTarget === "recovery";
}

export function getAtendimentoConversationStatusMeta(
  conversation: InboxConversation,
  allowRecoveryCapability = true,
): AtendimentoConversationStatusMeta {
  if (conversation.status === "blocked" || conversation.isBlocked) {
    return { label: "Bloqueado", shortLabel: "BLQ", tone: "blocked" };
  }
  if (isAtendimentoRecoveryConversation(conversation, allowRecoveryCapability)) {
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

export function mapAtendimentoConversationToneToQueueTone(
  tone: AtendimentoConversationStatusTone,
): WorkspaceQueueTone {
  if (tone === "human") return "success";
  if (tone === "recovery") return "amber";
  if (tone === "blocked") return "danger";
  if (tone === "closed") return "muted";
  return "brand";
}

function mapAtendimentoStatusMetaToBadgeTone(
  statusMeta: AtendimentoConversationStatusMeta,
): WorkspaceBadgeDescriptor["tone"] {
  if (statusMeta.tone === "human") return "success";
  if (statusMeta.tone === "recovery") return "warning";
  if (statusMeta.tone === "blocked") return "danger";
  if (statusMeta.tone === "closed") return "neutral";
  return "brand";
}

function formatRecoverySourceModuleLabel(sourceRaw: string | null | undefined) {
  const source = String(sourceRaw || "").trim().toLowerCase();
  if (!source) return "-";

  const labels: Record<string, string> = {
    hbx_recovery: "HBX Recovery",
    hbx_recovery_bot: "HBX Recovery BOT",
    inbox: "Atendimento",
    atendimento: "Atendimento",
    whatsapp: "WhatsApp",
  };

  return labels[source] || source.replace(/[_-]+/g, " ");
}

function humanizeRecoveryFlowKey(valueRaw: string | null | undefined) {
  const value = String(valueRaw || "").trim().toLowerCase();
  if (!value) return "-";

  const labels: Record<string, string> = {
    cobranca_recovery_whatsapp_hibrido: "Cobranca Recovery hibrida",
    inbox_recovery_fallback: "Recovery via inbox",
    hbx_recovery_default: "HBX Recovery",
  };

  return labels[value] || value.replace(/[_-]+/g, " ");
}

function formatAtendimentoRecoveryFlowResultLabel(flowResultRaw: string | null | undefined) {
  const flowResult = String(flowResultRaw || "").trim().toLowerCase();
  if (!flowResult) return "-";

  const labels: Record<string, string> = {
    manual_closed: "Encerrada manualmente",
    blocked_manual: "Bloqueada manualmente",
    paid: "Pagamento confirmado",
    payment_approved: "Pagamento aprovado",
    handoff_human: "Encaminhada ao humano",
  };

  return labels[flowResult] || flowResult.replace(/[_-]+/g, " ");
}

function formatAtendimentoRecoveryOperationLabel(conversation: InboxConversation) {
  if (conversation.humanAssigned) return "Humano em andamento";
  if (conversation.botActive === false) return "BOT pausado";
  if (conversation.botActive === true) return "BOT ativo";
  return "Operacao sem status";
}

export function buildAtendimentoQueueBadges(
  conversation: InboxConversation,
  allowRecoveryCapability = true,
): WorkspaceBadgeDescriptor[] {
  const statusMeta = getAtendimentoConversationStatusMeta(conversation, allowRecoveryCapability);
  const badges: WorkspaceBadgeDescriptor[] = [
    { label: statusMeta.label, tone: mapAtendimentoStatusMetaToBadgeTone(statusMeta) },
  ];

  if (
    isAtendimentoRecoveryConversation(conversation, allowRecoveryCapability) &&
    statusMeta.tone !== "recovery"
  ) {
    badges.push({ label: "Recovery", tone: "warning" });
  }

  if (allowRecoveryCapability && isAtendimentoRecoveryConversation(conversation, allowRecoveryCapability)) {
    if (conversation.humanAssigned) {
      badges.push({ label: "Fila humana", tone: "success" });
    } else if (conversation.botActive === true) {
      badges.push({ label: "BOT ativo", tone: "neutral" });
    }
  }

  if (
    (conversation.status === "blocked" || conversation.isBlocked) &&
    statusMeta.tone !== "blocked"
  ) {
    badges.push({ label: "Bloqueado", tone: "danger" });
  }

  return badges;
}

export function buildAtendimentoThreadBadges(
  conversation: InboxConversation,
  formatCurrency: (value: number) => string,
  allowRecoveryCapability = true,
): WorkspaceBadgeDescriptor[] {
  const statusMeta = getAtendimentoConversationStatusMeta(conversation, allowRecoveryCapability);
  const badges: WorkspaceBadgeDescriptor[] = [
    { label: statusMeta.label, tone: mapAtendimentoStatusMetaToBadgeTone(statusMeta) },
  ];

  if (isAtendimentoRecoveryConversation(conversation, allowRecoveryCapability)) {
    badges.push({ label: "Rota recovery", tone: "warning" });
  }

  if (allowRecoveryCapability && conversation.recoveryCurrentStep) {
    badges.push({
      label: mapRecoveryFlowStepLabel(conversation.recoveryCurrentStep),
      tone: "neutral",
    });
  }

  if (allowRecoveryCapability && isAtendimentoRecoveryConversation(conversation, allowRecoveryCapability)) {
    badges.push({
      label: formatAtendimentoRecoveryOperationLabel(conversation),
      tone: conversation.humanAssigned ? "success" : "neutral",
    });
  }

  if (allowRecoveryCapability && conversation.recoveryOpenAmount > 0) {
    badges.push({ label: formatCurrency(conversation.recoveryOpenAmount), tone: "brand" });
  }

  return badges;
}

export function buildAtendimentoContextSummary(input: {
  conversation: InboxConversation;
  displayName: string;
  statusLabel: string;
  updatedAtLabel: string;
  blockedAtLabel?: string | null;
  formatCurrency: (value: number) => string;
  allowRecoveryCapability?: boolean;
}): WorkspaceSummaryDescriptor[] {
  const {
    conversation,
    displayName,
    statusLabel,
    updatedAtLabel,
    blockedAtLabel,
    formatCurrency,
    allowRecoveryCapability = true,
  } = input;

  const summary: WorkspaceSummaryDescriptor[] = [
    { label: "Cliente", value: displayName },
    { label: "Telefone", value: conversation.customer.phone },
    { label: "Status", value: statusLabel || "-" },
    { label: "Motivo", value: conversation.routeReason || "-" },
    { label: "Atualizado", value: updatedAtLabel },
  ];

  if (allowRecoveryCapability && conversation.recoveryCurrentStep) {
    summary.push({
      label: "Etapa recovery",
      value: mapRecoveryFlowStepLabel(conversation.recoveryCurrentStep),
    });
  }

  if (allowRecoveryCapability && conversation.latestSourceModule) {
    summary.push({
      label: "Origem do fluxo",
      value: formatRecoverySourceModuleLabel(conversation.latestSourceModule),
    });
  }

  if (allowRecoveryCapability && conversation.recoveryOpenAmount > 0) {
    summary.push({
      label: "Recovery",
      value: formatCurrency(conversation.recoveryOpenAmount),
    });
  }

  if (blockedAtLabel) {
    summary.push({
      label: "Bloqueio",
      value: conversation.blockedReason
        ? `${blockedAtLabel} - ${conversation.blockedReason}`
        : blockedAtLabel,
    });
  }

  return summary;
}

export function getAtendimentoComposerHint(
  conversation: InboxConversation,
  allowRecoveryCapability = true,
) {
  return isAtendimentoRecoveryConversation(conversation, allowRecoveryCapability)
    ? "Esta conversa tambem aparece no Recovery."
    : "O bot pode retomar a conversa depois do encerramento.";
}

export function formatAtendimentoRecoveryStatusLabel(statusRaw: string | null | undefined) {
  const status = String(statusRaw || "").trim().toUpperCase();
  if (!status) return "-";

  const labels: Record<string, string> = {
    OVERDUE: "Em cobranca",
    PAID: "Pago",
    PENDING: "Pendente",
    ACTIVE: "Ativo",
  };

  return labels[status] || status.replace(/[_-]+/g, " ");
}

export function formatAtendimentoRecoveryPaymentStatusLabel(statusRaw: string | null | undefined) {
  const status = String(statusRaw || "").trim().toLowerCase();
  if (!status) return "Sem pagamento";

  const labels: Record<string, string> = {
    pending: "Pendente",
    approved: "Aprovado",
    released: "Liberado",
    cancelled: "Cancelado",
    failed: "Falhou",
    refunded: "Estornado",
    partially_refunded: "Estorno parcial",
  };

  return labels[status] || status.replace(/[_-]+/g, " ");
}

export function buildAtendimentoRecoverySummary(input: {
  conversation: InboxConversation;
  formatCurrency: (value: number) => string;
}): WorkspaceSummaryDescriptor[] {
  const { conversation, formatCurrency } = input;

  return [
    {
      label: "Status cobranca",
      value: formatAtendimentoRecoveryStatusLabel(conversation.recoveryStatus),
    },
    {
      label: "Fluxo",
      value: humanizeRecoveryFlowKey(conversation.currentFlow),
    },
    {
      label: "Resultado",
      value: formatAtendimentoRecoveryFlowResultLabel(conversation.flowResult),
    },
    {
      label: "Operacao",
      value: formatAtendimentoRecoveryOperationLabel(conversation),
    },
    {
      label: "Score de risco",
      value:
        conversation.recoveryRiskScore === null || conversation.recoveryRiskScore === undefined
          ? "-"
          : String(conversation.recoveryRiskScore),
    },
    {
      label: "Valor em aberto",
      value: formatCurrency(conversation.recoveryOpenAmount || 0),
    },
    {
      label: "Total recuperado",
      value: formatCurrency(conversation.recoveryTotalPaid || 0),
    },
  ];
}

export function buildAtendimentoRecoveryPaymentHistory(conversation: InboxConversation) {
  return (conversation.recoveryPaymentHistory || []).slice(0, 3);
}

export function getAtendimentoRecoveryPaymentDate(payment: InboxRecoveryPaymentSummary) {
  return payment.paidAt || payment.createdAt || null;
}
