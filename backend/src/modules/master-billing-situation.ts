import { resolveCompanyAccessState, type CompanyAccessState } from './company-access-state';

export type MasterBillingSituationReason =
  | 'paid'
  | 'trial'
  | 'manual'
  | 'exempt'
  | 'grace'
  | 'pending_checkout'
  | 'overdue'
  | 'suspended'
  | 'no_method'
  | 'unknown';

export type MasterBillingLedgerEntryLike = {
  id: string;
  companyId: number;
  entryType: string;
  entryGroup: string;
  status: string;
  origin: string | null;
  currency: string;
  competence: string | null;
  amount: number;
  dueDate: Date | null;
  paidAt: Date | null;
  paymentMethod: string | null;
  referenceLabel: string | null;
  observation: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MasterBillingLedgerSummary = {
  id: string;
  status: string;
  amount: number;
  paidAt: string | null;
  dueDate: string | null;
  paymentMethod: string | null;
  referenceLabel: string | null;
  origin: string | null;
  competence: string | null;
};

export type MasterBillingSituation = {
  canUse: boolean;
  reason: MasterBillingSituationReason;
  statusLabel: string;
  amountDue: number;
  currentCycleAmount: number;
  billingCycle: string;
  paymentMethod: string | null;
  provider: string | null;
  lastPayment: MasterBillingLedgerSummary | null;
  lastFailure: MasterBillingLedgerSummary | null;
  nextDueAt: string | null;
  daysOverdue: number;
  hasPendingIssues: boolean;
};

type BuildMasterBillingSituationInput = {
  company: any;
  ledgerRows: MasterBillingLedgerEntryLike[];
  canUse: boolean;
  currentCycleAmount: number;
  billingCycle: string;
  paymentMethod?: string | null;
  provider?: string | null;
  nextDueAt?: string | null;
  daysOverdue?: number | null;
};

function normalizeAmount(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(2));
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : null;
}

function normalizeCycle(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
}

// Projecao do estado canonico para o vocabulario do financeiro do master.
function reasonFromAccessState(access: CompanyAccessState): MasterBillingSituationReason {
  if (access.state === 'paying') return 'paid';
  if (access.state === 'trial' || access.state === 'trial_ending') return 'trial';
  if (access.state === 'manual') return 'manual';
  if (access.state === 'exempt') return 'exempt';
  if (access.state === 'grace') return 'grace';
  if (access.state === 'pending_checkout') return 'pending_checkout';
  if (access.state === 'overdue') return 'overdue';
  if (access.state === 'suspended') return 'suspended';
  if (access.state === 'unknown' && access.detailCode === 'no_payment_method') return 'no_method';
  return 'unknown';
}

function summarizeLedgerEntry(row?: MasterBillingLedgerEntryLike | null): MasterBillingLedgerSummary | null {
  if (!row) return null;
  return {
    id: String(row.id),
    status: String(row.status || ''),
    amount: normalizeAmount(row.amount),
    paidAt: toIso(row.paidAt),
    dueDate: toIso(row.dueDate),
    paymentMethod: row.paymentMethod ? String(row.paymentMethod) : null,
    referenceLabel: row.referenceLabel ? String(row.referenceLabel) : null,
    origin: row.origin ? String(row.origin) : null,
    competence: row.competence ? String(row.competence) : null,
  };
}

export function buildMasterBillingSituation({
  company,
  ledgerRows,
  canUse,
  currentCycleAmount,
  billingCycle,
  paymentMethod,
  provider,
  nextDueAt,
  daysOverdue,
}: BuildMasterBillingSituationInput): MasterBillingSituation {
  const normalizedPaymentMethod = String(paymentMethod ?? company?.paymentMethod ?? '').trim().toUpperCase() || null;
  const normalizedProvider = String(provider ?? company?.billingProvider ?? '').trim() || null;
  const cycleAmount = normalizeAmount(currentCycleAmount);
  const revenueRows = (ledgerRows || []).filter((row) => String(row.entryGroup || 'revenue') === 'revenue');
  const pendingRows = revenueRows.filter((row) => String(row.status || '').trim().toUpperCase() === 'PENDING');
  const failedRows = revenueRows.filter((row) =>
    ['FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(String(row.status || '').trim().toUpperCase()),
  );
  const lastPayment =
    revenueRows.find((row) => String(row.status || '').trim().toUpperCase() === 'APPROVED') || null;
  const lastFailure = failedRows[0] || null;
  const pendingAmount = normalizeAmount(
    pendingRows.reduce((total, row) => total + normalizeAmount(row.amount), 0),
  );
  const access = resolveCompanyAccessState({
    ...company,
    isActive: canUse,
    paymentMethod: normalizedPaymentMethod,
  });
  const reason = reasonFromAccessState(access);
  const normalizedDaysOverdue = Math.max(0, Math.trunc(Number(daysOverdue || 0) || 0));
  const amountDue =
    reason === 'overdue'
      ? normalizeAmount(Math.max(pendingAmount, cycleAmount))
      : pendingAmount;

  return {
    canUse,
    reason,
    statusLabel: access.statusLabel,
    amountDue,
    currentCycleAmount: cycleAmount,
    billingCycle: normalizeCycle(billingCycle || company?.billingCycle),
    paymentMethod: normalizedPaymentMethod,
    provider: normalizedProvider,
    lastPayment: summarizeLedgerEntry(lastPayment),
    lastFailure: summarizeLedgerEntry(lastFailure),
    nextDueAt: nextDueAt || null,
    daysOverdue: normalizedDaysOverdue,
    hasPendingIssues: pendingRows.length > 0 || failedRows.length > 0 || reason === 'overdue',
  };
}
