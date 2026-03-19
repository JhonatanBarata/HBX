export type RecoveryRiskTone = "low" | "medium" | "high";

export type RecoveryPaymentRecord = {
  id: string;
  label: string;
  date: string;
  amount: number;
  status: string;
};

export type RecoveryDelayRecord = {
  id: string;
  period: string;
  daysLate: number;
  outcome: string;
};

export type RecoveryCustomerStatus = "overdue" | "paid";

export type RecoveryCustomer = {
  id: string;
  contactId?: string;
  name: string;
  clientName?: string;
  whatsappNumber: string;
  registrationDate?: string;
  openAmount: number;
  workdaySaleDay: number;
  recurringDelays: number;
  paymentHistoryScore: number;
  totalPaid: number;
  averageDelay: number;
  automationEnabled: boolean;
  lastContact: string;
  status: RecoveryCustomerStatus;
  paymentHistory: RecoveryPaymentRecord[];
  delayHistory: RecoveryDelayRecord[];
};

export type RecoveryRiskScore = {
  score: number;
  tone: RecoveryRiskTone;
  label: string;
};

export type RecoveryFlowStage = {
  id: string;
  title: string;
  channel: string;
  template: string;
  daysAfter: number;
  enabled: boolean;
  sortOrder: number;
};

export type RecoveryBotTopicId =
  | "hbx_recovery_subject_discount"
  | "hbx_recovery_subject_deadline"
  | "hbx_recovery_subject_wrong_number"
  | "hbx_recovery_subject_paid"
  | "hbx_recovery_subject_dispute"
  | "hbx_recovery_subject_other";

export type RecoveryBotTopic = {
  id: RecoveryBotTopicId;
  title: string;
  description: string;
};

export type RecoveryBotActionId =
  | "view_amount"
  | "choose_installments"
  | "pay_full"
  | "talk_human"
  | "talk_later"
  | "close_topic"
  | "followup_today"
  | "followup_tomorrow"
  | "followup_week"
  | "installment_2"
  | "installment_3"
  | "installment_4"
  | "installment_5"
  | "generate_installment_link"
  | "paid_claim";

export type RecoveryBotAnyActionId = RecoveryBotActionId | string;

export type RecoveryBotButton = {
  actionId: RecoveryBotAnyActionId;
  title: string;
};

export type RecoveryBotStartTemplate = {
  id: string;
  name: string;
  language: string;
  active: boolean;
};

export type RecoveryBotVariableScope = "shared" | "recovery" | "atendimento";

export type RecoveryBotVariableDefinition = {
  key: string;
  label: string;
  example: string;
  description: string;
  scope: RecoveryBotVariableScope;
  required: boolean;
};

export type RecoveryBotActionGuide = {
  actionId: RecoveryBotAnyActionId;
  title: string;
  description: string;
  route: RecoveryBotVariableScope;
  enabled: boolean;
  responseMessage?: string;
  custom?: boolean;
};

export type RecoveryRoutingRules = {
  preferRecoveryForDebtors: boolean;
  preferRecoveryForNegotiations: boolean;
  preferInboxForManualQueue: boolean;
};

export type RecoveryBotConfig = {
  variableCatalog: RecoveryBotVariableDefinition[];
  actionCatalog: RecoveryBotActionGuide[];
  routingRules: RecoveryRoutingRules;
  startTemplates: RecoveryBotStartTemplate[];
  rootFooter: string;
  mainMenuPrompt: string;
  mainMenuButtons: RecoveryBotButton[];
  declineMenuPrompt: string;
  declineMenuButtons: RecoveryBotButton[];
  followupPrompt: string;
  followupButtons: RecoveryBotButton[];
  valueMessageTemplate: string;
  valueButtons: RecoveryBotButton[];
  installmentsPrompt: string;
  installmentButtons: RecoveryBotButton[];
  installmentConfirmTemplate: string;
  installmentConfirmButtons: RecoveryBotButton[];
  cashLinkMessageTemplate: string;
  installmentLinkMessageTemplate: string;
  postLinkPrompt: string;
  postLinkButtons: RecoveryBotButton[];
  closeTopicMessage: string;
  paidClaimMessage: string;
  humanAckMessage: string;

  // Legacy fields kept for compatibility
  initialTemplateName: string;
  initialTemplateLanguage: string;
  rootPrompt: string;
  optionPixLabel: string;
  optionCardLabel: string;
  optionAgentLabel: string;
  topicsPrompt: string;
  topicsButtonLabel: string;
  topics: RecoveryBotTopic[];
};

export type RecoveryMetaTemplateItem = {
  id: string | null;
  name: string;
  language: string;
  category: string;
  status: string;
  qualityScore: string | null;
  rejectedReason: string | null;
  headerFormat: string | null;
  headerText: string | null;
  headerHandle: string | null;
  headerMediaUrl: string | null;
  bodyText: string;
  footerText: string | null;
  buttonLabels: string[];
  variableKeys: string[];
  components: unknown[];
  normalized: {
    name: string;
    language: string;
    category: string;
    status: string;
    qualityScore: string | null;
    rejectedReason: string | null;
    header: {
      format: "NONE" | "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO";
      text: string | null;
      exampleHandle: string | null;
      mediaUrl: string | null;
      mediaFileName: string | null;
      mediaContentType: string | null;
      mediaBase64: string | null;
    };
    body: {
      text: string;
      variableOrder: string[];
      variableExamples: Record<string, string>;
    };
    footer: {
      text: string | null;
    };
    buttons: Array<{
      type: string;
      text: string | null;
      url: string | null;
      phoneNumber: string | null;
    }>;
    components: unknown[];
  };
  hbxActive: boolean;
  lastMetaSyncAt: string | null;
  metaApproved: boolean;
  eligibleForRecovery: boolean;
};

export type RecoveryMetaTemplateHistoryItem = {
  id: string;
  templateKey: string;
  name: string;
  language: string;
  previousStatus: string | null;
  nextStatus: string;
  reason: string | null;
  changedAt: string;
};

export type RecoveryMetaTemplatesPayload = {
  phoneNumberId: string | null;
  wabaId: string | null;
  lastSyncAt: string | null;
  syncError?: string | null;
  counters: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    hbxActive: number;
    eligible: number;
  };
  templates: RecoveryMetaTemplateItem[];
  history: RecoveryMetaTemplateHistoryItem[];
};

export type RecoveryMetaHeaderUploadPayload = {
  ok: boolean;
  headerHandle: string;
  headerMediaUrl: string;
  fileName: string;
  contentType: string;
  registry?: RecoveryMetaTemplatesPayload;
};

export type RecoveryLayoutConfig = {
  templates: {
    historyPosition: "before" | "after";
    workspaceMode: "row" | "column";
    workspaceLeadPane: "composer" | "catalog";
    windowOrder: Array<"composer" | "catalog" | "history" | "preview">;
    workspacePrimaryPercent: number;
    catalogHeight: number;
    composerHeight: number;
    composerMode: "row" | "column";
    composerPreviewPercent: number;
  };
};

export type RecoveryLayoutConfigPayload = {
  config: RecoveryLayoutConfig;
  canEditLayout: boolean;
};

export type RecoveryPaymentLifecycle = "paid" | "in_progress" | "finalized" | "cancelled";

export type RecoveryPaymentHistoryItem = {
  id: string;
  customerId: string;
  customerName: string;
  customerWhatsapp: string;
  conversationId: number | null;
  amount: number;
  currency: string;
  description: string;
  status: string;
  statusLabel: string;
  lifecycle: RecoveryPaymentLifecycle;
  chargeType: "avista" | "parcelado";
  installmentCount: number;
  installmentValue: number;
  paymentUrl: string | null;
  linkExpiresAt: string | null;
  mpPaymentId: string | null;
  mpPreferenceId: string | null;
  externalReference: string | null;
  serviceDate: string | null;
  serviceDescription: string | null;
  refundAmount: number;
  createdAt: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  canRefund: boolean;
};

export type RecoveryPaymentHistorySummary = {
  month: string;
  monthLabel: string;
  lifecycleFilter: RecoveryPaymentLifecycle | "all";
  counters: {
    paid: number;
    in_progress: number;
    finalized: number;
    cancelled: number;
  };
  totals: {
    totalApprovedAmount: number;
    totalCommissionAmount: number;
    totalApprovedCount: number;
    pendingCount: number;
  };
  billing: {
    pendingAmount: number;
    grossAmount: number;
    commissionAmount: number;
    netAmount: number;
  };
  records: RecoveryPaymentHistoryItem[];
};

export type RecoveryInteractionConversation = {
  conversationId: number;
  customerId: string;
  customerName: string;
  customerWhatsapp: string;
  conversationWhatsapp: string;
  customerStatus: string;
  openAmount: number;
  lastContact: string;
  humanQueue: boolean;
  isClosed?: boolean;
  botActive: boolean;
  humanAssigned: boolean;
  assignedUserId: number | null;
  currentFlow: string;
  currentStep: string;
  flowResult: string | null;
  metadata: Record<string, unknown>;
  complaintCount: number;
  lastMessage: string;
  lastDirection: string;
  lastSourceModule: string;
  lastAt: string;
  lastInteractionAt: string | null;
  paymentGenerated: boolean;
  paymentLifecycle: string | null;
  paymentStatus: string | null;
  paymentLink: string | null;
  paymentLinkExpiresAt: string | null;
};

export type RecoveryInteractionSummary = {
  queue: "all" | "closed";
  pendingHumanCount: number;
  conversations: RecoveryInteractionConversation[];
};

export type RecoveryInteractionMessage = {
  id: number;
  direction: string;
  messageType: string;
  senderType: string | null;
  body: string;
  variables: Record<string, unknown>;
  status: string;
  sourceModule: string | null;
  isComplaint: boolean;
  timestamp: string;
};

export type RecoveryInteractionDetail = {
  conversationId: number;
  botActive: boolean;
  humanAssigned: boolean;
  assignedUserId: number | null;
  currentFlow: string;
  currentStep: string;
  flowResult: string | null;
  metadata: Record<string, unknown>;
  lastInteractionAt: string | null;
  customer: {
    id: string;
    name: string;
    whatsappNumber: string;
    conversationWhatsapp: string;
    openAmount: number;
    status: string;
  };
  latestPayment: RecoveryPaymentHistoryItem | null;
  messages: RecoveryInteractionMessage[];
};

export type RecoveryAgendaItem = {
  conversationId: number;
  customerId: string;
  customerName: string;
  customerWhatsapp: string;
  openAmount: number;
  preference: string | null;
  currentStep: string | null;
  dueAt: string;
  lastInteractionAt: string | null;
  status: "overdue" | "today" | "upcoming";
  lastMessage: string;
};

export type RecoveryAgendaSummary = {
  counters: {
    total: number;
    overdue: number;
    today: number;
    upcoming: number;
  };
  items: RecoveryAgendaItem[];
};

export type RecoveryOverview = {
  overdueTotal: number;
  dueSoonTotal: number;
  recoveredThisMonth: number;
  beforeInstallation: number;
  currentDelinquency: number;
  reductionPercent: number;
};

export type RecoveryTrendPoint = {
  id: string;
  label: string;
  amount: number;
  note: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseIsoDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function calculateRiskScore(customer: RecoveryCustomer): RecoveryRiskScore {
  if (customer.openAmount <= 0) {
    return {
      score: 12,
      tone: "low",
      label: "Quitado",
    };
  }

  const amountComponent = clamp(customer.openAmount / 520, 0, 34);
  const recurrenceComponent = clamp(customer.recurringDelays * 6, 0, 26);
  const delayComponent = clamp(customer.averageDelay * 0.65, 0, 24);
  const historyComponent = clamp((10 - customer.paymentHistoryScore) * 3.2, 0, 18);

  const score = Math.round(
    clamp(18 + amountComponent + recurrenceComponent + delayComponent + historyComponent, 1, 99),
  );

  if (score >= 72) return { score, tone: "high", label: "Alto" };
  if (score >= 46) return { score, tone: "medium", label: "Medio" };
  return { score, tone: "low", label: "Baixo" };
}

function getDaysUntilWorkday(workdaySaleDay: number, now: Date) {
  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (workdaySaleDay >= today) return workdaySaleDay - today;
  return daysInMonth - today + workdaySaleDay;
}

function getPaymentAmountForMonth(customer: RecoveryCustomer, year: number, monthIndex: number) {
  let total = 0;
  for (const payment of customer.paymentHistory) {
    const parsed = parseIsoDate(payment.date);
    if (!parsed) continue;
    if (parsed.getFullYear() === year && parsed.getMonth() === monthIndex) {
      total += Number(payment.amount || 0);
    }
  }
  return total;
}

function getCurrentMonthRecovered(customers: RecoveryCustomer[], now: Date) {
  let total = 0;
  for (const customer of customers) {
    total += getPaymentAmountForMonth(customer, now.getFullYear(), now.getMonth());
  }
  return total;
}

function getPortfolioBaseline(customers: RecoveryCustomer[]) {
  let total = 0;
  for (const customer of customers) {
    total += Number(customer.openAmount || 0) + Number(customer.totalPaid || 0);
  }
  return total;
}

function formatCurrencyCompact(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function buildRecoveryOverview(customers: RecoveryCustomer[]): RecoveryOverview {
  const now = new Date();
  const overdueCustomers = customers.filter((customer) => Number(customer.openAmount || 0) > 0);

  let overdueTotal = 0;
  let dueSoonTotal = 0;
  for (const customer of overdueCustomers) {
    const openAmount = Number(customer.openAmount || 0);
    overdueTotal += openAmount;
    if (getDaysUntilWorkday(customer.workdaySaleDay, now) <= 7) {
      dueSoonTotal += openAmount;
    }
  }

  const recoveredThisMonth = getCurrentMonthRecovered(customers, now);
  const beforeInstallation = getPortfolioBaseline(customers);
  const currentDelinquency = overdueTotal;
  const reductionPercent =
    beforeInstallation > 0
      ? clamp(((beforeInstallation - currentDelinquency) / beforeInstallation) * 100, 0, 100)
      : 0;

  return {
    overdueTotal,
    dueSoonTotal,
    recoveredThisMonth,
    beforeInstallation,
    currentDelinquency,
    reductionPercent,
  };
}

function getMonthWindow(now: Date, size: number) {
  const months: Array<{ year: number; month: number; id: string; label: string }> = [];
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "short" });
  for (let offset = size - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const labelRaw = formatter.format(date).replace(".", "");
    const label = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1);
    months.push({
      year: date.getFullYear(),
      month: date.getMonth(),
      id: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label,
    });
  }
  return months;
}

export function buildRecoveryTrend(customers: RecoveryCustomer[]): RecoveryTrendPoint[] {
  if (customers.length === 0) return [];
  const now = new Date();
  const overview = buildRecoveryOverview(customers);
  const baseline = overview.beforeInstallation;
  const months = getMonthWindow(now, 6);
  let currentAmount = baseline;

  return months.map((month, index) => {
    let recovered = 0;
    for (const customer of customers) {
      recovered += getPaymentAmountForMonth(customer, month.year, month.month);
    }
    currentAmount = Math.max(0, currentAmount - recovered);
    if (index === months.length - 1) currentAmount = overview.currentDelinquency;
    return {
      id: `trend-${month.id}`,
      label: month.label,
      amount: Math.round(currentAmount),
      note:
        recovered > 0
          ? `Recuperado no mes: ${formatCurrencyCompact(recovered)}`
          : "Sem recuperacao registrada",
    };
  });
}
