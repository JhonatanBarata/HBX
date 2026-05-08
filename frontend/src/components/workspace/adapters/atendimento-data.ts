import type {
  InboxConversation,
  InboxRecoveryPaymentSummary,
  VendasProspeccaoMetadata,
  VendasProspeccaoStage,
} from "@/app/atendimento/inbox-model";
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

const ATENDIMENTO_FINANCIAL_HINTS = [
  "recovery",
  "cobranca",
  "cobrança",
  "financeiro",
  "inadimpl",
  "debito",
  "débito",
  "pagamento",
  "negociacao",
  "negociação",
];

function getAtendimentoFinancialHaystack(conversation: InboxConversation) {
  return [
    conversation.currentFlow,
    conversation.flowResult,
    conversation.routeReason,
    conversation.latestSourceModule,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join(" ");
}

function hasAtendimentoFinancialFlowSignal(conversation: InboxConversation) {
  const haystack = getAtendimentoFinancialHaystack(conversation);
  return ATENDIMENTO_FINANCIAL_HINTS.some((hint) => haystack.includes(hint));
}

function getConversationMetadata(conversation: InboxConversation) {
  return conversation?.metadata && typeof conversation.metadata === "object" && !Array.isArray(conversation.metadata)
    ? (conversation.metadata as Record<string, unknown>)
    : {};
}

export function isAtendimentoPersonalContact(conversation: InboxConversation) {
  const metadata = getConversationMetadata(conversation);
  return Boolean(
    metadata.inboxPersonalContact ||
      metadata.personalContact ||
      metadata.whatsappPersonalContact ||
      conversation.flowResult === "personal_contact",
  );
}

export function hasAtendimentoAgendaQueueSignal(conversation: InboxConversation) {
  const metadata = getConversationMetadata(conversation);
  const queue =
    metadata?.vendasAgendaQueue &&
    typeof metadata.vendasAgendaQueue === "object" &&
    !Array.isArray(metadata.vendasAgendaQueue)
      ? (metadata.vendasAgendaQueue as Record<string, unknown>)
      : null;
  const prospeccao =
    metadata?.vendasProspeccao &&
    typeof metadata.vendasProspeccao === "object" &&
    !Array.isArray(metadata.vendasProspeccao)
      ? (metadata.vendasProspeccao as VendasProspeccaoMetadata)
      : null;

  return (
    Boolean(queue?.active) ||
    ["pending_send", "scheduled_send", "sent_waiting", "needs_review"].includes(
      String(prospeccao?.stage || "") as VendasProspeccaoStage,
    )
  );
}

function getAtendimentoProspeccaoStage(conversation: InboxConversation): VendasProspeccaoStage | null {
  const metadata =
    conversation?.metadata && typeof conversation.metadata === "object" && !Array.isArray(conversation.metadata)
      ? (conversation.metadata as Record<string, unknown>)
      : null;
  const prospeccao =
    metadata?.vendasProspeccao &&
    typeof metadata.vendasProspeccao === "object" &&
    !Array.isArray(metadata.vendasProspeccao)
      ? (metadata.vendasProspeccao as VendasProspeccaoMetadata)
      : null;
  const stage = String(prospeccao?.stage || "").trim().toLowerCase();
  const stages: VendasProspeccaoStage[] = [
    "pending_send",
    "scheduled_send",
    "sent_waiting",
    "reply_received",
    "expired_no_reply",
    "needs_review",
    "no_whatsapp",
    "negative_reply",
  ];
  return stages.includes(stage as VendasProspeccaoStage) ? (stage as VendasProspeccaoStage) : null;
}

function getAtendimentoProspeccaoBadge(stage: VendasProspeccaoStage | null): WorkspaceBadgeDescriptor | null {
  if (!stage) return null;
  const labels: Record<VendasProspeccaoStage, WorkspaceBadgeDescriptor> = {
    pending_send: { label: "Pendente", tone: "warning" },
    scheduled_send: { label: "Agendado", tone: "info" },
    sent_waiting: { label: "Aguardando resposta", tone: "purple" },
    reply_received: { label: "Interessado", tone: "success" },
    expired_no_reply: { label: "Sem resposta", tone: "neutral" },
    needs_review: { label: "Revisar", tone: "purple" },
    no_whatsapp: { label: "Sem WhatsApp", tone: "danger" },
    negative_reply: { label: "Sem interesse", tone: "danger" },
  };
  return labels[stage];
}

function formatSharedDateLabel(valueRaw: string | null | undefined) {
  const normalized = String(valueRaw || "").trim();
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

function formatAtendimentoPhoneLabel(valueRaw: string | null | undefined) {
  const digits = String(valueRaw || "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return "Contato WhatsApp";
}

export function hasAtendimentoOpenDebt(conversation: InboxConversation) {
  return Number(conversation.recoveryOpenAmount || 0) > 0;
}

export function hasAtendimentoRecoveryContext(conversation: InboxConversation) {
  return hasAtendimentoOpenDebt(conversation);
}

export function isAtendimentoRecoveryPrimary(conversation: InboxConversation) {
  return (
    (conversation.routeTarget === "recovery" && hasAtendimentoOpenDebt(conversation)) ||
    (hasAtendimentoOpenDebt(conversation) && hasAtendimentoFinancialFlowSignal(conversation))
  );
}

export function isAtendimentoRecoveryConversation(
  conversation: InboxConversation,
  allowRecoveryCapability = true,
) {
  return allowRecoveryCapability && isAtendimentoRecoveryPrimary(conversation);
}

export function isAtendimentoAgendaConversation(conversation: InboxConversation) {
  if (hasAtendimentoAgendaQueueSignal(conversation)) return true;
  const haystack = getAtendimentoFinancialHaystack(conversation);

  return haystack.includes("agenda") || haystack.includes("agendado");
}

export function getAtendimentoConversationStatusMeta(
  conversation: InboxConversation,
  allowRecoveryCapability = true,
): AtendimentoConversationStatusMeta {
  const isRecoveryPrimary =
    allowRecoveryCapability && isAtendimentoRecoveryPrimary(conversation);

  if (conversation.status === "blocked" || conversation.isBlocked) {
    return { label: "Bloqueado", shortLabel: "BLQ", tone: "blocked" };
  }
  if (isRecoveryPrimary) {
    return { label: "Recovery", shortLabel: "REC", tone: "recovery" };
  }
  if (conversation.status === "open") {
    return { label: "Humano", shortLabel: "HUM", tone: "human" };
  }
  if (conversation.status === "closed") {
    return { label: "Encerrado", shortLabel: "OK", tone: "closed" };
  }
  return { label: "Bot", shortLabel: "Bot", tone: "bot" };
}

export function mapAtendimentoConversationToneToQueueTone(
  tone: AtendimentoConversationStatusTone,
): WorkspaceQueueTone {
  if (tone === "human") return "info";
  if (tone === "recovery") return "amber";
  if (tone === "blocked") return "danger";
  if (tone === "closed") return "muted";
  return "purple";
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
    hbx_recovery_bot: "HBX Recovery Bot",
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
  if (conversation.botActive === false) return "Bot pausado";
  if (conversation.botActive === true) return "Bot ativo";
  return "Operacao sem status";
}

function formatIdentityStatusLabel(valueRaw: string | null | undefined) {
  const value = String(valueRaw || "").trim().toLowerCase();
  if (!value) return "-";

  const labels: Record<string, string> = {
    provisional: "Provisorio",
    active: "Ativo",
    pending_confirmation: "Pendente de confirmacao",
    confirmed: "Confirmado",
    manual: "Manual",
    whatsapp_bot: "WhatsApp Bot",
    recovery: "Recovery",
  };

  return labels[value] || value.replace(/[_-]+/g, " ");
}

export function buildAtendimentoQueueBadges(
  conversation: InboxConversation,
  allowRecoveryCapability = true,
): WorkspaceBadgeDescriptor[] {
  const statusMeta = getAtendimentoConversationStatusMeta(conversation, allowRecoveryCapability);
  const hasRecoveryContext =
    allowRecoveryCapability && hasAtendimentoRecoveryContext(conversation);
  const hasOpenDebt = allowRecoveryCapability && hasAtendimentoOpenDebt(conversation);
  const isRecoveryPrimary =
    allowRecoveryCapability && isAtendimentoRecoveryPrimary(conversation);
  const badges: WorkspaceBadgeDescriptor[] = [];

  if (isAtendimentoPersonalContact(conversation)) {
    badges.push({ label: "Contato pessoal", tone: "success" });
    if (conversation.botActive === false) badges.push({ label: "Bot pausado nesta conversa", tone: "neutral" });
  }

  if (isRecoveryPrimary) {
    badges.push({ label: "Recovery", tone: "warning" });
  } else if (hasRecoveryContext) {
    badges.push({ label: "Financeiro", tone: "warning" });
  }

  if (hasOpenDebt) {
    badges.push({ label: "Em aberto", tone: "brand" });
  }

  if (conversation.customer.sharedProfile?.presence?.vendas?.present) {
    badges.push({ label: "Vendas", tone: "info" });
  }

  const prospeccaoStage = getAtendimentoProspeccaoStage(conversation);
  const prospeccaoBadge = getAtendimentoProspeccaoBadge(prospeccaoStage);
  if (prospeccaoBadge) {
    badges.push(prospeccaoBadge);
  }

  if (isAtendimentoAgendaConversation(conversation)) {
    badges.push({ label: "Agenda", tone: "teal" });
  }

  if (conversation.status === "open" || conversation.humanAssigned) {
    badges.push({
      label: "Humano",
      tone: prospeccaoStage && prospeccaoStage !== "reply_received" ? "info" : "success",
    });
  } else if (conversation.status !== "closed" && !conversation.isBlocked) {
    badges.push({ label: "Bot", tone: "neutral" });
  }

  if (conversation.status === "blocked" || conversation.isBlocked) {
    badges.push({ label: "Bloqueado", tone: "danger" });
  }

  if (conversation.status === "closed") {
    badges.push({ label: "Encerrado", tone: "neutral" });
  }

  if (badges.length === 0) {
    badges.push({ label: statusMeta.label, tone: mapAtendimentoStatusMetaToBadgeTone(statusMeta) });
  }

  return badges;
}

export function buildAtendimentoThreadBadges(
  conversation: InboxConversation,
  formatCurrency: (value: number) => string,
  allowRecoveryCapability = true,
): WorkspaceBadgeDescriptor[] {
  const hasRecoveryContext =
    allowRecoveryCapability && hasAtendimentoRecoveryContext(conversation);
  const hasOpenDebt = allowRecoveryCapability && hasAtendimentoOpenDebt(conversation);
  const badges: WorkspaceBadgeDescriptor[] = buildAtendimentoQueueBadges(
    conversation,
    allowRecoveryCapability,
  );

  if (hasRecoveryContext && conversation.recoveryCurrentStep) {
    badges.push({
      label: mapRecoveryFlowStepLabel(conversation.recoveryCurrentStep),
      tone: "neutral",
    });
  }

  if (hasRecoveryContext) {
    badges.push({
      label: formatAtendimentoRecoveryOperationLabel(conversation),
      tone: conversation.humanAssigned ? "success" : "neutral",
    });
  }

  if (hasOpenDebt) {
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
  const hasRecoveryContext =
    allowRecoveryCapability && hasAtendimentoRecoveryContext(conversation);
  const hasOpenDebt = allowRecoveryCapability && hasAtendimentoOpenDebt(conversation);
  const isRecoveryPrimary =
    allowRecoveryCapability && isAtendimentoRecoveryPrimary(conversation);

  const summary: WorkspaceSummaryDescriptor[] = [
    { label: "Cliente", value: displayName },
    { label: "Telefone", value: formatAtendimentoPhoneLabel(conversation.customer.phone) },
    {
      label: "Perfil central",
      value: conversation.customer.customerProfileId
        ? `${formatIdentityStatusLabel(conversation.customer.customerProfileStatus)} • ${conversation.customer.customerProfileId}`
        : "Nao vinculado",
    },
    { label: "Status", value: statusLabel || "-" },
    {
      label: "Cadastro",
      value: formatIdentityStatusLabel(conversation.customer.registrationStatus),
    },
    {
      label: "Contexto",
      value: isRecoveryPrimary
        ? "Financeiro como frente principal"
        : hasRecoveryContext
          ? "Atendimento com contexto financeiro"
        : isAtendimentoAgendaConversation(conversation)
          ? "Atendimento com agenda ativa"
          : "Atendimento padrao",
    },
    { label: "Motivo", value: conversation.routeReason || "-" },
    { label: "Atualizado", value: updatedAtLabel },
  ];

  if (conversation.customer.document) {
    summary.push({ label: "Documento", value: conversation.customer.document });
  }

  if (conversation.customer.email) {
    summary.push({ label: "Email", value: conversation.customer.email });
  }

  if (conversation.customer.customerProfileSource) {
    summary.push({
      label: "Origem do perfil",
      value: formatIdentityStatusLabel(conversation.customer.customerProfileSource),
    });
  }

  if (conversation.customer.sharedProfile?.origin) {
    summary.push({
      label: "Origem geral",
      value: formatIdentityStatusLabel(conversation.customer.sharedProfile.origin),
    });
  }

  if (conversation.customer.sharedProfile?.currentContext) {
    summary.push({
      label: "Contexto geral",
      value: formatIdentityStatusLabel(conversation.customer.sharedProfile.currentContext),
    });
  }

  if (conversation.customer.sharedProfile?.presence?.vendas?.present) {
    summary.push({
      label: "Presença em vendas",
      value:
        conversation.customer.sharedProfile.presence.vendas.status
          ? formatIdentityStatusLabel(conversation.customer.sharedProfile.presence.vendas.status)
          : "Ativo no funil comercial",
    });
  }

  if (hasRecoveryContext && conversation.recoveryCurrentStep) {
    summary.push({
      label: "Etapa recovery",
      value: mapRecoveryFlowStepLabel(conversation.recoveryCurrentStep),
    });
  }

  if (hasRecoveryContext && conversation.latestSourceModule) {
    summary.push({
      label: "Origem do fluxo",
      value: formatRecoverySourceModuleLabel(conversation.latestSourceModule),
    });
  }

  if (hasOpenDebt) {
    summary.push({
      label: "Divida em aberto",
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

  if (conversation.customer.sharedProfile?.lastContactAt) {
    summary.push({
      label: "Ultimo toque geral",
      value: formatSharedDateLabel(conversation.customer.sharedProfile.lastContactAt),
    });
  }

  return summary;
}

export function getAtendimentoComposerHint(
  conversation: InboxConversation,
  allowRecoveryCapability = true,
) {
  const hasRecoveryContext =
    allowRecoveryCapability && hasAtendimentoRecoveryContext(conversation);
  const hasOpenDebt = allowRecoveryCapability && hasAtendimentoOpenDebt(conversation);

  return hasOpenDebt
    ? "A conversa segue no Atendimento com divida aberta e contexto financeiro ativo."
    : hasRecoveryContext
      ? "Ha contexto financeiro disponivel sem tirar o foco do Atendimento."
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
