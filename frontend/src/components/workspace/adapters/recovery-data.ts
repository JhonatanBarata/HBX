import type {
  RecoveryInteractionConversation,
  RecoveryInteractionDetail,
} from "@/app/hbx-recovery/recovery-model";
import type {
  WorkspaceBadgeDescriptor,
  WorkspaceQueueTone,
  WorkspaceSummaryDescriptor,
} from "./types";

export function mapRecoveryFlowStepLabel(stepRaw: string) {
  const step = String(stepRaw || "").trim().toLowerCase();
  const labels: Record<string, string> = {
    cobranca_template_enviado: "Template enviado",
    aguardando_resposta_template: "Aguardando resposta",
    cobranca_menu_principal: "Menu principal",
    exibindo_valor: "Exibindo valor",
    escolhendo_parcelamento: "Preparando link no credito",
    confirmando_parcelamento: "Confirmando link no credito",
    link_gerado_avista: "Link avista gerado",
    link_gerado_parcelado: "Link no credito gerado",
    aguardando_pagamento: "Aguardando pagamento",
    atendimento_humano: "Atendimento humano",
    recusado: "Contato recusado",
    followup_agendado: "Follow-up agendado",
    encerrado: "Encerrado",
  };
  return labels[step] || (step ? step.replace(/_/g, " ") : "Sem etapa");
}

export function mapRecoveryQueueTone(input: {
  humanAssigned?: boolean;
  humanQueue?: boolean;
  isBlocked?: boolean;
  paymentGenerated?: boolean;
  botActive?: boolean;
}): WorkspaceQueueTone {
  if (input.isBlocked) return "danger";
  if (input.humanAssigned || input.humanQueue) return "success";
  if (input.paymentGenerated) return "amber";
  if (input.botActive) return "brand";
  return "muted";
}

export function getRecoveryQueueLabel(item: RecoveryInteractionConversation) {
  if (item.humanAssigned || item.humanQueue) return "HUM";
  if (item.isBlocked) return "BLK";
  if (item.paymentGenerated) return "PAY";
  return "Bot";
}

export function buildRecoveryQueueBadges(
  item: RecoveryInteractionConversation,
): WorkspaceBadgeDescriptor[] {
  const badges: WorkspaceBadgeDescriptor[] = [];

  if (item.humanAssigned || item.humanQueue) {
    badges.push({ label: "Humano", tone: "warning" });
  }
  if (item.botActive) {
    badges.push({ label: "Bot ativo", tone: "brand" });
  }
  if (item.paymentGenerated) {
    badges.push({ label: "Pagamento", tone: "teal" });
  }
  if (item.isBlocked) {
    badges.push({ label: "Bloqueado", tone: "danger" });
  }

  return badges;
}

export function getRecoveryThreadAvatarMeta(
  detail: RecoveryInteractionDetail,
  input: { paymentGenerated?: boolean },
) {
  return {
    label: detail.humanAssigned ? "HUM" : detail.isBlocked ? "BLK" : "REC",
    tone: mapRecoveryQueueTone({
      humanAssigned: detail.humanAssigned,
      isBlocked: Boolean(detail.isBlocked),
      paymentGenerated: Boolean(input.paymentGenerated),
      botActive: detail.botActive,
    }),
  };
}

export function buildRecoveryThreadBadges(
  detail: RecoveryInteractionDetail,
  input: {
    paymentGenerated?: boolean;
    paymentIsPaid?: boolean;
    linkExpired?: boolean;
  },
): WorkspaceBadgeDescriptor[] {
  const badges: WorkspaceBadgeDescriptor[] = [
    { label: mapRecoveryFlowStepLabel(detail.currentStep), tone: "neutral" },
  ];

  if (detail.humanAssigned) {
    badges.push({ label: "Atendimento humano", tone: "warning" });
  }
  if (detail.botActive) {
    badges.push({ label: "Bot ativo", tone: "brand" });
  }
  if (input.paymentGenerated) {
    badges.push({ label: "Pagamento gerado", tone: "teal" });
  }
  if (input.paymentIsPaid) {
    badges.push({ label: "Pago", tone: "success" });
  }
  if (input.linkExpired) {
    badges.push({ label: "Link expirado", tone: "danger" });
  }

  return badges;
}

export function buildRecoveryFinancialSummary(input: {
  detail: RecoveryInteractionDetail;
  companyLabel: string;
  latestPaymentStatusLabel: string;
  latestPaymentUrlLabel: string;
  paymentAttemptCount: number;
  lastInteractionLabel: string;
  formatCurrency: (value: number) => string;
}): WorkspaceSummaryDescriptor[] {
  const {
    detail,
    companyLabel,
    latestPaymentStatusLabel,
    latestPaymentUrlLabel,
    paymentAttemptCount,
    lastInteractionLabel,
    formatCurrency,
  } = input;

  return [
    { label: "Cliente", value: detail.customer.name },
    { label: "Empresa", value: companyLabel },
    { label: "Valor original", value: formatCurrency(detail.customer.openAmount || 0) },
    { label: "Status cobranca", value: mapRecoveryFlowStepLabel(detail.currentStep) },
    { label: "Status pagamento", value: latestPaymentStatusLabel },
    { label: "Ultimo link", value: latestPaymentUrlLabel },
    { label: "Tentativas", value: String(paymentAttemptCount) },
    { label: "Ultima interacao", value: lastInteractionLabel },
  ];
}
