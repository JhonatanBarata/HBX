"use client";

import Link from "next/link";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import { dispatchMasterContextChanged } from "@/lib/masterContextEvents";
import styles from "./page.module.css";

type CurrentUser = {
  id: number;
  username?: string | null;
  email?: string | null;
  isSystemMaster?: boolean;
  masterContext?: {
    active: boolean;
    companyId: number | null;
    companyName: string | null;
  } | null;
};

type MetricKind = "currency" | "count";

type SummaryMetric = {
  kind: MetricKind;
  value: number;
  auxValue?: number | null;
  previousValue?: number | null;
  delta?: number | null;
  note: string;
};

type RevenuePoint = {
  id: string;
  label: string;
  received: number;
  projected: number;
  loss: number;
};

type PaymentPoint = {
  id: string;
  label: string;
  approved: number;
  failed: number;
  manual: number;
  pending: number;
};

type DistributionPoint = {
  key: string;
  label: string;
  value: number;
};

type TrialConversion = {
  active: number;
  converted: number;
  expired: number;
  extended: number;
};

type ModuleRevenuePoint = {
  label: string;
  value: number;
};

type StatusBucket =
  | "PAYING"
  | "TRIAL"
  | "TRIAL_ENDING"
  | "OVERDUE"
  | "SUSPENDED"
  | "NO_METHOD"
  | "UNKNOWN";

type LedgerEntry = {
  id: string;
  entryType: string;
  status: string;
  origin?: string | null;
  competence?: string | null;
  amount: number;
  dueDate?: string | null;
  paidAt?: string | null;
  paymentMethod?: string | null;
  referenceLabel?: string | null;
  observation?: string | null;
  createdAt?: string | null;
};

type CompanySummary = {
  id: number;
  name: string;
  slug?: string | null;
  primaryContactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isActive: boolean;
  userCount: number;
  plan?: {
    id: number;
    name: string;
    price: number;
  } | null;
  monthlyValue: number;
  paymentStatus: string;
  paymentMethod?: string | null;
  subscriptionStatus?: string | null;
  billingProvider?: string | null;
  premiumAccess?: boolean;
  trialStartsAt?: string | null;
  trialEndsAt?: string | null;
  trialRemainingDays?: number | null;
  subscriptionCurrentPeriodStart?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  nextDueAt?: string | null;
  daysOverdue: number;
  currentOutstandingValue: number;
  statusBucket: StatusBucket;
  riskLevel: "stable" | "warning" | "critical";
  financialSituation: string;
  lastPayment?: LedgerEntry | null;
  lastFailure?: LedgerEntry | null;
  manualPaymentPending?: boolean;
  recentCardFailure?: boolean;
  websiteNeedsAttention?: boolean;
  website: {
    enabled: boolean;
    configured: boolean;
    adminEnabled: boolean;
    publicUrl?: string | null;
    adminUrl?: string | null;
    projectId?: string | null;
    launchMode?: "public" | "admin";
  };
  mercadoPago: {
    status?: string | null;
    accountEmail?: string | null;
    accountUserId?: string | null;
    tokenConfigured: boolean;
    usingMasterToken?: boolean;
    masterCredentialKey?: string | null;
    masterCredentialLabel?: string | null;
  };
  modules: Array<{
    key: string;
    name: string;
    enabled: boolean;
    monthlyPrice?: number;
  }>;
  modulesTotalMonthlyValue?: number;
};

type MasterMercadoPagoCredential = {
  key: string;
  label: string;
  accessToken?: string | null;
  accessTokenPreview?: string | null;
  configured: boolean;
  sourceCompanyId?: number | null;
  sourceCompanyName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type MasterWhatsAppCredential = {
  key: string;
  label: string;
  accessToken?: string | null;
  accessTokenPreview?: string | null;
  phoneNumberId?: string | null;
  wabaId?: string | null;
  whatsappNumber?: string | null;
  displayNumber?: string | null;
  configured: boolean;
  sourceCompanyId?: number | null;
  sourceCompanyName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type AttentionGroup = {
  id: string;
  title: string;
  severity: "info" | "warning" | "danger" | string;
  count: number;
  companies: Array<{
    id: number;
    name: string;
    statusBucket: StatusBucket;
    nextDueAt?: string | null;
    trialRemainingDays?: number | null;
  }>;
};

type WorkspacePayload = {
  generatedAt: string;
  summary: Record<string, SummaryMetric>;
  charts: {
    revenue: RevenuePoint[];
    payments: PaymentPoint[];
    baseStatus: DistributionPoint[];
    trialConversion: TrialConversion;
    revenueByModule: ModuleRevenuePoint[];
  };
  attention: AttentionGroup[];
  companies: CompanySummary[];
  masterIntegrations: {
    mercadoPagoConfigured: boolean;
    whatsappConfigured: boolean;
    mercadoPagoLibrary: MasterMercadoPagoCredential[];
    whatsappLibrary: MasterWhatsAppCredential[];
  };
  systemModules: Array<{
    id: number;
    key: string;
    name: string;
    description?: string | null;
    monthlyPrice: number;
    defaultEnabled: boolean;
    companyAssignable: boolean;
    serviceUrl?: string | null;
  }>;
};

type CompanyUser = {
  id: number;
  username?: string | null;
  email?: string | null;
  role: string;
  isActive: boolean;
  deactivatedAt?: string | null;
  retentionUntil?: string | null;
  createdAt?: string | null;
};

type AuditEntry = {
  id: string;
  scope: string;
  action: string;
  severity: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

type CompanyDetailPayload = {
  generatedAt: string;
  company: CompanySummary & {
    taxDocument?: string | null;
    users: CompanyUser[];
    financeHistory: LedgerEntry[];
    trialHistory: AuditEntry[];
    auditTimeline: AuditEntry[];
    whatsapp: {
      tokenConfigured?: boolean;
      usingMasterToken?: boolean;
      endpoints: Array<{
        id: string;
        label?: string | null;
        moduleKey?: string | null;
        whatsappNumber?: string | null;
        whatsappDisplayNumber?: string | null;
        whatsappStatus?: string | null;
        whatsappStatusError?: string | null;
        accessTokenConfigured: boolean;
        accessTokenValue?: string | null;
        isActive: boolean;
        isPrimary: boolean;
      }>;
      companyAccessTokenConfigured?: boolean;
      companyAccessTokenValue?: string | null;
      masterCredentialKey?: string | null;
      masterCredentialLabel?: string | null;
      masterAccessTokenConfigured?: boolean;
      masterAccessTokenValue?: string | null;
      masterPhoneNumberId?: string | null;
      masterWabaId?: string | null;
      masterDisplayNumber?: string | null;
    };
    mercadoPago: CompanySummary["mercadoPago"] & {
      statusError?: string | null;
      lastValidatedAt?: string | null;
      accessTokenValue?: string | null;
      masterCredentialKey?: string | null;
      masterCredentialLabel?: string | null;
      masterTokenConfigured?: boolean;
      masterAccessTokenValue?: string | null;
    };
    masterIntegrations?: WorkspacePayload["masterIntegrations"];
  };
};

type ProfileDraft = {
  name: string;
  primaryContactName: string;
  contactEmail: string;
  contactPhone: string;
  taxDocument: string;
  paymentMethod: string;
  subscriptionStatus: string;
  billingProvider: string;
  premiumAccess: boolean;
};

type WebsiteDraft = {
  websiteEnabled: boolean;
  websitePublicUrl: string;
  websiteAdminUrl: string;
  websiteProjectId: string;
  websiteAdminEnabled: boolean;
  websiteLaunchMode: "public" | "admin";
};

type MercadoPagoDraft = {
  mercadoPagoAccessToken: string;
  status: string;
  statusError: string | null;
  accountEmail: string | null;
  accountUserId: string | null;
  lastValidatedAt: string | null;
  accessTokenConfigured: boolean;
};

type ModuleCatalogDraft = {
  key: string;
  name: string;
  description: string;
  monthlyPrice: string;
  companyAssignable: boolean;
  defaultEnabled: boolean;
};

type MasterIntegrationsDraft = WorkspacePayload["masterIntegrations"];

type UserModalState = {
  mode: "create" | "edit" | "reset";
  companyId: number;
  companyName: string;
  userId?: number;
  userLabel?: string;
  email: string;
  username: string;
  role: "USER" | "ADMIN" | "GERENTE";
  password: string;
};

type ManualPaymentState = {
  companyId: number;
  companyName: string;
  value: string;
  competence: string;
  paidAt: string;
  dueDate: string;
  paymentMethod: string;
  observation: string;
  settlePending: boolean;
  generateAudit: boolean;
};

type ConfirmActionState = {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "primary" | "danger";
  run: () => Promise<void>;
};

type DrawerTab =
  | "summary"
  | "finance"
  | "users"
  | "modules"
  | "website"
  | "integrations"
  | "audit";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "PAYING", label: "Pagando" },
  { id: "TRIAL", label: "Trial" },
  { id: "TRIAL_ENDING", label: "Trial vencendo" },
  { id: "OVERDUE", label: "Inadimplentes" },
  { id: "NO_METHOD", label: "Sem método" },
  { id: "manual", label: "Pagamento manual" },
  { id: "SUSPENDED", label: "Suspensos" },
] as const;

const TABS: Array<{ id: DrawerTab; label: string }> = [
  { id: "summary", label: "Resumo" },
  { id: "finance", label: "Financeiro" },
  { id: "users", label: "Usuários" },
  { id: "modules", label: "Módulos" },
  { id: "website", label: "Website" },
  { id: "integrations", label: "Integrações" },
  { id: "audit", label: "Auditoria" },
];

function formatCurrency(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

function formatCurrencyInput(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeCurrencyInput(raw: string) {
  const digits = String(raw || "").replace(/\D+/g, "");
  const amount = Number(digits || 0) / 100;
  return formatCurrencyInput(amount);
}

function parseCurrencyInput(raw: string) {
  const normalized = String(raw || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function paymentMethodLabel(value?: string | null) {
  const method = String(value || "").trim().toUpperCase();
  if (method === "CARD") return "Cartão";
  if (method === "PIX") return "Pix";
  if (method === "BOLETO") return "Boleto";
  if (method === "MANUAL") return "Manual";
  if (method === "TRANSFERENCIA") return "Transferência";
  if (method === "DINHEIRO") return "Dinheiro";
  return "Sem método";
}

function subscriptionLabel(value?: string | null) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "active") return "Ativa";
  if (status === "trialing") return "Trial";
  if (status === "past_due") return "Em atraso";
  if (status === "canceled") return "Cancelada";
  if (status === "expired") return "Expirada";
  return status || "-";
}

function paymentStatusLabel(value?: string | null) {
  const status = String(value || "").trim().toUpperCase();
  if (status === "PAID") return "Pago";
  if (status === "TRIAL") return "Trial";
  if (status === "PENDING") return "Pendente";
  if (status === "OVERDUE") return "Atrasado";
  if (status === "EXPIRED") return "Expirado";
  if (status === "DISABLED") return "Suspenso";
  return status || "-";
}

function bucketLabel(value: StatusBucket) {
  if (value === "PAYING") return "Pagando";
  if (value === "TRIAL") return "Trial";
  if (value === "TRIAL_ENDING") return "Trial vencendo";
  if (value === "OVERDUE") return "Atrasado";
  if (value === "SUSPENDED") return "Suspenso";
  if (value === "NO_METHOD") return "Sem método";
  return "Indefinido";
}

function badgeClass(tone: string) {
  if (tone === "success") return "badge badge-success";
  if (tone === "danger") return "badge badge-danger";
  if (tone === "warning" || tone === "brand") return "badge badge-brand";
  return "badge";
}

function statusTone(bucket: StatusBucket) {
  if (bucket === "PAYING") return "success";
  if (bucket === "TRIAL" || bucket === "TRIAL_ENDING") return "warning";
  if (bucket === "OVERDUE" || bucket === "SUSPENDED" || bucket === "NO_METHOD") return "danger";
  return "neutral";
}

function initials(label?: string | null) {
  const parts = String(label || "MASTER")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "MS";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function toDatetimeLocalValue(value?: string | null) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) return "";
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toDateInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function metricValue(metric?: SummaryMetric) {
  if (!metric) return "-";
  return metric.kind === "currency"
    ? formatCurrency(metric.value)
    : metric.value.toLocaleString("pt-BR");
}

function metricDelta(metric?: SummaryMetric) {
  if (!metric || metric.delta == null || metric.previousValue == null) return "Sem base anterior";
  const sign = metric.delta > 0 ? "+" : metric.delta < 0 ? "-" : "";
  const deltaValue =
    metric.kind === "currency"
      ? formatCurrency(Math.abs(metric.delta))
      : Math.abs(metric.delta).toLocaleString("pt-BR");
  return `${sign}${deltaValue} vs. mês anterior`;
}

function buildProfileDraft(company: CompanyDetailPayload["company"]): ProfileDraft {
  return {
    name: company.name || "",
    primaryContactName: company.primaryContactName || "",
    contactEmail: company.contactEmail || "",
    contactPhone: company.contactPhone || "",
    taxDocument: company.taxDocument || "",
    paymentMethod: company.paymentMethod || "NONE",
    subscriptionStatus: company.subscriptionStatus || "trialing",
    billingProvider: company.billingProvider || "manual",
    premiumAccess: Boolean(company.premiumAccess),
  };
}

function buildWebsiteDraft(company: CompanyDetailPayload["company"]): WebsiteDraft {
  return {
    websiteEnabled: Boolean(company.website.enabled),
    websitePublicUrl: company.website.publicUrl || "",
    websiteAdminUrl: company.website.adminUrl || "",
    websiteProjectId: company.website.projectId || "",
    websiteAdminEnabled: Boolean(company.website.adminEnabled),
    websiteLaunchMode: company.website.launchMode === "admin" ? "admin" : "public",
  };
}

function buildMercadoPagoDraft(company: CompanyDetailPayload["company"]): MercadoPagoDraft {
  return {
    mercadoPagoAccessToken: "",
    status: company.mercadoPago.status || "DISCONNECTED",
    statusError: company.mercadoPago.statusError || null,
    accountEmail: company.mercadoPago.accountEmail || null,
    accountUserId: company.mercadoPago.accountUserId || null,
    lastValidatedAt: company.mercadoPago.lastValidatedAt || null,
    accessTokenConfigured: Boolean(company.mercadoPago.tokenConfigured),
  };
}

function buildModuleCatalogDrafts(workspace?: WorkspacePayload | null): Record<string, ModuleCatalogDraft> {
  const entries = (workspace?.systemModules || []).map((moduleItem) => [
    moduleItem.key,
    {
      key: moduleItem.key,
      name: moduleItem.name,
      description: moduleItem.description || "",
      monthlyPrice: formatCurrencyInput(moduleItem.monthlyPrice ?? 0),
      companyAssignable: Boolean(moduleItem.companyAssignable),
      defaultEnabled: Boolean(moduleItem.defaultEnabled),
    },
  ]);
  return Object.fromEntries(entries);
}

function buildMasterIntegrationsDraft(workspace?: WorkspacePayload | null): MasterIntegrationsDraft {
  return {
    mercadoPagoConfigured: Boolean(workspace?.masterIntegrations?.mercadoPagoConfigured),
    whatsappConfigured: Boolean(workspace?.masterIntegrations?.whatsappConfigured),
    mercadoPagoLibrary: [...(workspace?.masterIntegrations?.mercadoPagoLibrary || [])],
    whatsappLibrary: [...(workspace?.masterIntegrations?.whatsappLibrary || [])],
  };
}

function createDraftKey(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function buildCsv(detail: CompanyDetailPayload["company"]) {
  const header = [
    "id",
    "competencia",
    "tipo",
    "valor",
    "status",
    "origem",
    "metodo",
    "vencimento",
    "pagamento",
    "observacao",
  ];
  const lines = detail.financeHistory.map((entry) => [
    entry.id,
    entry.competence || "",
    entry.entryType,
    String(entry.amount),
    entry.status,
    entry.origin || "",
    entry.paymentMethod || "",
    entry.dueDate || "",
    entry.paidAt || "",
    (entry.observation || "").replace(/[\r\n;]+/g, " "),
  ]);
  return [header, ...lines]
    .map((line) => line.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}

function MetricCard({ title, metric, accent }: { title: string; metric?: SummaryMetric; accent?: string }) {
  return (
    <article className={styles.metricCard} data-accent={accent || "default"}>
      <div className={styles.metricCardHeader}>
        <p className={styles.metricEyebrow}>{title}</p>
        <span className={styles.metricTrend}>{metricDelta(metric)}</span>
      </div>
      <strong className={styles.metricValue}>{metricValue(metric)}</strong>
      {metric?.auxValue ? <span className={styles.metricAux}>Auxiliar: {formatCurrency(metric.auxValue)}</span> : null}
      <p className={styles.metricNote}>{metric?.note || "Sem dados consolidados."}</p>
    </article>
  );
}

function RevenueChart({ points }: { points: RevenuePoint[] }) {
  if (!points.length) return <div className={styles.emptyPanel}>Sem histórico suficiente.</div>;

  const width = 860;
  const height = 280;
  const paddingX = 28;
  const paddingY = 28;
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.received, point.projected, point.loss]));
  const stepX = points.length > 1 ? (width - paddingX * 2) / (points.length - 1) : width - paddingX * 2;
  const baselineY = height - paddingY;

  const build = (key: keyof RevenuePoint) =>
    points.map((point, index) => {
      const x = paddingX + stepX * index;
      const value = Number(point[key] || 0);
      const y = baselineY - (value / maxValue) * (height - paddingY * 2);
      return { x, y, label: point.label };
    });

  const received = build("received");
  const projected = build("projected");
  const loss = build("loss");
  const path = (items: Array<{ x: number; y: number }>) =>
    items.map((item, index) => `${index === 0 ? "M" : "L"} ${item.x} ${item.y}`).join(" ");
  const projectedArea = `${path(projected)} L ${projected[projected.length - 1]?.x || 0} ${baselineY} L ${projected[0]?.x || 0} ${baselineY} Z`;

  return (
    <div className={styles.chartCard}>
      <div className={styles.panelCardHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Financeiro</p>
          <h3>Receita recebida, prevista e perda</h3>
        </div>
        <div className={styles.chartLegend}>
          <span><i className={styles.legendDot} data-tone="received" />Recebida</span>
          <span><i className={styles.legendDot} data-tone="projected" />Prevista</span>
          <span><i className={styles.legendDot} data-tone="loss" />Perda</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.chartSvg}>
        {[0.2, 0.45, 0.7, 0.95].map((guide) => {
          const y = paddingY + (height - paddingY * 2) * guide;
          return <line key={guide} x1={paddingX} x2={width - paddingX} y1={y} y2={y} className={styles.chartGrid} />;
        })}
        <path d={projectedArea} className={styles.chartProjectedArea} />
        <path d={path(projected)} className={styles.chartProjectedLine} />
        <path d={path(received)} className={styles.chartReceivedLine} />
        <path d={path(loss)} className={styles.chartLossLine} />
        {received.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r={4.5} className={styles.chartPoint} />
            <text x={point.x} y={baselineY + 18} textAnchor="middle" className={styles.chartAxis}>
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DistributionCard({
  title,
  eyebrow,
  points,
  currency = false,
}: {
  title: string;
  eyebrow: string;
  points: Array<{ label: string; value: number }>;
  currency?: boolean;
}) {
  const max = Math.max(1, ...points.map((point) => point.value));

  return (
    <div className={styles.panelCard}>
      <div className={styles.panelCardHeader}>
        <div>
          <p className={styles.sectionEyebrow}>{eyebrow}</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className={styles.distributionList}>
        {points.length ? (
          points.map((point) => (
            <div key={point.label} className={styles.distributionItem}>
              <div className={styles.distributionMeta}>
                <span>{point.label}</span>
                <strong>{currency ? formatCurrency(point.value) : point.value.toLocaleString("pt-BR")}</strong>
              </div>
              <div className={styles.distributionTrack}>
                <div className={styles.distributionFill} style={{ width: `${(point.value / max) * 100}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyPanel}>Nenhum dado suficiente.</div>
        )}
      </div>
    </div>
  );
}

function paymentModeLabel(mode: "approved" | "failed" | "manual" | "pending") {
  if (mode === "approved") return "Aprovados";
  if (mode === "failed") return "Falhos";
  if (mode === "manual") return "Manuais";
  return "Pendentes";
}

function PaymentChart({
  points,
  mode,
  onModeChange,
}: {
  points: PaymentPoint[];
  mode: "approved" | "failed" | "manual" | "pending";
  onModeChange: (mode: "approved" | "failed" | "manual" | "pending") => void;
}) {
  if (!points.length) return <div className={styles.emptyPanel}>Sem volume suficiente para pagamentos.</div>;

  const max = Math.max(1, ...points.map((point) => Number(point[mode] || 0)));

  return (
    <div className={styles.panelCard}>
      <div className={styles.panelCardHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Pagamentos</p>
          <h3>{paymentModeLabel(mode)} por período</h3>
        </div>
        <div className={styles.filterChips}>
          {(["approved", "failed", "manual", "pending"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={mode === option ? styles.filterChipActive : styles.filterChip}
              onClick={() => onModeChange(option)}
            >
              {paymentModeLabel(option)}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.paymentBars}>
        {points.map((point) => {
          const value = Number(point[mode] || 0);
          return (
            <article key={`${point.id}-${mode}`} className={styles.paymentBar}>
              <div className={styles.paymentBarTrack}>
                <div
                  className={styles.paymentBarFill}
                  data-mode={mode}
                  style={{ height: `${Math.max(10, (value / max) * 100)}%` }}
                />
              </div>
              <strong className={styles.paymentBarValue}>{value.toLocaleString("pt-BR")}</strong>
              <span className={styles.paymentBarLabel}>{point.label}</span>
            </article>
          );
        })}
      </div>
      <p className={styles.paymentHint}>
        Alterne entre aprovados, falhos, manuais e pendentes para localizar rapidamente a pressão do funil de cobrança.
      </p>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ModalShell({
  title,
  subtitle,
  open,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className={styles.modalRoot}>
      <button type="button" className={styles.modalBackdrop} onClick={onClose} aria-label="Fechar modal" />
      <article className={wide ? `${styles.modalCard} ${styles.modalCardWide}` : styles.modalCard}>
        <header className={styles.modalHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Operação MASTER</p>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose}>
            Fechar
          </button>
        </header>
        {children}
      </article>
    </div>
  );
}

export default function MasterPremiumPage() {
  const hasToken = useRequireAuth();
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<CompanyDetailPayload | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("summary");
  const [search, setSearch] = useState("");
  const [filterId, setFilterId] = useState("all");
  const [sortId, setSortId] = useState("risk");
  const [paymentMode, setPaymentMode] = useState<"approved" | "failed" | "manual" | "pending">("approved");
  const [quickCompanyId, setQuickCompanyId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [createCompanyOpen, setCreateCompanyOpen] = useState(false);
  const [masterIntegrationsOpen, setMasterIntegrationsOpen] = useState(false);
  const [moduleCatalogOpen, setModuleCatalogOpen] = useState(false);
  const [createCompanyName, setCreateCompanyName] = useState("");
  const [createCompanySlug, setCreateCompanySlug] = useState("");
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const [websiteDraft, setWebsiteDraft] = useState<WebsiteDraft | null>(null);
  const [mercadoPagoDraft, setMercadoPagoDraft] = useState<MercadoPagoDraft | null>(null);
  const [trialDateDraft, setTrialDateDraft] = useState("");
  const [trialDaysDraft, setTrialDaysDraft] = useState("7");
  const [moduleCatalogDrafts, setModuleCatalogDrafts] = useState<Record<string, ModuleCatalogDraft>>({});
  const [masterIntegrationsDraft, setMasterIntegrationsDraft] = useState<MasterIntegrationsDraft>({
    mercadoPagoConfigured: false,
    whatsappConfigured: false,
    mercadoPagoLibrary: [],
    whatsappLibrary: [],
  });
  const [integrationVisibility, setIntegrationVisibility] = useState<Record<string, boolean>>({});
  const [userModal, setUserModal] = useState<UserModalState | null>(null);
  const [manualPaymentModal, setManualPaymentModal] = useState<ManualPaymentState | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);
  const deferredSearch = useDeferredValue(search);
  const commercialModuleDrafts = useMemo(
    () =>
      Object.values(moduleCatalogDrafts)
        .filter((moduleItem) => moduleItem.companyAssignable)
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
    [moduleCatalogDrafts],
  );

  async function loadWorkspace(background = false) {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [workspacePayload, userPayload] = await Promise.all([
        apiFetch<WorkspacePayload>("/modules/master/workspace"),
        apiFetch<CurrentUser>("/profile/current-user"),
      ]);
      setWorkspace(workspacePayload);
      setCurrentUser(userPayload);
      setModuleCatalogDrafts(buildModuleCatalogDrafts(workspacePayload));
      setMasterIntegrationsDraft(buildMasterIntegrationsDraft(workspacePayload));
      if (!quickCompanyId && workspacePayload.companies.length) {
        setQuickCompanyId(String(workspacePayload.companies[0].id));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o command center.");
    } finally {
      if (background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  async function loadDetail(companyId: number, preferredTab?: DrawerTab) {
    setDetailLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<CompanyDetailPayload>(`/modules/master/company/${companyId}/detail`);
      setDetail(payload);
      setProfileDraft(buildProfileDraft(payload.company));
      setWebsiteDraft(buildWebsiteDraft(payload.company));
      setMercadoPagoDraft(buildMercadoPagoDraft(payload.company));
      setTrialDateDraft(toDateInputValue(payload.company.trialEndsAt));
      if (preferredTab) setDrawerTab(preferredTab);
      setDrawerOpen(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao abrir detalhes da empresa.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshAll(companyId?: number | null) {
    await loadWorkspace(true);
    if (companyId) {
      await loadDetail(companyId, drawerTab);
    }
  }

  useEffect(() => {
    if (hasToken !== true) return;
    loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  useEffect(() => {
    const anyModalOpen =
      createCompanyOpen ||
      masterIntegrationsOpen ||
      moduleCatalogOpen ||
      Boolean(userModal) ||
      Boolean(manualPaymentModal) ||
      Boolean(confirmAction);
    const focusOpen = drawerOpen || anyModalOpen;
    if (typeof document === "undefined") return;
    document.body.classList.toggle("master-company-focus-open", focusOpen);
    document.body.style.overflow = focusOpen ? "hidden" : "";
    const topbar = document.querySelector<HTMLElement>(".app-topbar");
    if (topbar) {
      if (focusOpen) {
        topbar.dataset.masterFocusHidden = "true";
        topbar.style.opacity = "0";
        topbar.style.pointerEvents = "none";
        topbar.style.transform = "translateY(-16px)";
        topbar.style.visibility = "hidden";
      } else if (topbar.dataset.masterFocusHidden === "true") {
        topbar.style.opacity = "";
        topbar.style.pointerEvents = "";
        topbar.style.transform = "";
        topbar.style.visibility = "";
        delete topbar.dataset.masterFocusHidden;
      }
    }
    return () => {
      document.body.classList.remove("master-company-focus-open");
      document.body.style.overflow = "";
      const activeTopbar = document.querySelector<HTMLElement>(".app-topbar");
      if (activeTopbar?.dataset.masterFocusHidden === "true") {
        activeTopbar.style.opacity = "";
        activeTopbar.style.pointerEvents = "";
        activeTopbar.style.transform = "";
        activeTopbar.style.visibility = "";
        delete activeTopbar.dataset.masterFocusHidden;
      }
    };
  }, [
    drawerOpen,
    createCompanyOpen,
    masterIntegrationsOpen,
    moduleCatalogOpen,
    userModal,
    manualPaymentModal,
    confirmAction,
  ]);

  const filteredCompanies = useMemo(() => {
    const items = [...(workspace?.companies || [])];
    const normalizedSearch = deferredSearch.trim().toLowerCase();
    let filtered = items;

    if (normalizedSearch) {
      filtered = filtered.filter((company) => {
        const haystack = [
          company.name,
          company.primaryContactName,
          company.contactEmail,
          company.contactPhone,
          company.slug,
          company.plan?.name,
          ...company.modules.map((module) => module.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      });
    }

    if (filterId !== "all") {
      filtered = filtered.filter((company) => {
        if (filterId === "manual") return Boolean(company.manualPaymentPending);
        return company.statusBucket === filterId;
      });
    }

    filtered.sort((left, right) => {
      if (sortId === "name") return left.name.localeCompare(right.name);
      if (sortId === "revenue") return right.monthlyValue - left.monthlyValue;
      if (sortId === "due") {
        return new Date(left.nextDueAt || 0).getTime() - new Date(right.nextDueAt || 0).getTime();
      }
      const riskWeight = { critical: 0, warning: 1, stable: 2 } as const;
      const diff = riskWeight[left.riskLevel] - riskWeight[right.riskLevel];
      if (diff !== 0) return diff;
      return right.currentOutstandingValue - left.currentOutstandingValue;
    });

    return filtered;
  }, [workspace?.companies, deferredSearch, filterId, sortId]);

  const activeCompany = detail?.company || null;
  const activeContextCompanyId = currentUser?.masterContext?.active ? currentUser.masterContext.companyId : null;
  const quickCompanyTarget = workspace?.companies.find((company) => String(company.id) === quickCompanyId) || null;

  function openCompany(companyId: number, preferredTab: DrawerTab = "summary") {
    startTransition(() => {
      setDrawerTab(preferredTab);
      void loadDetail(companyId, preferredTab);
    });
  }

  async function submitCreateCompany() {
    if (!createCompanyName.trim()) {
      setError("Informe o nome da empresa.");
      return;
    }
    setBusyAction("create-company");
    setError(null);
    try {
      const created = await apiFetch<{ id: number; name: string }>("/companies/master", {
        method: "POST",
        body: JSON.stringify({
          name: createCompanyName.trim(),
          slug: createCompanySlug.trim() || undefined,
        }),
      });
      setCreateCompanyOpen(false);
      setCreateCompanyName("");
      setCreateCompanySlug("");
      setMessage(`Empresa criada com sucesso: ${created.name}.`);
      await loadWorkspace(true);
      openCompany(created.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao criar empresa.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveSystemModule(moduleKey: string) {
    const draft = moduleCatalogDrafts[moduleKey];
    if (!draft) return;
    setBusyAction(`system-module-${moduleKey}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/system-modules/${moduleKey}`, {
        method: "PUT",
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim(),
          monthlyPrice: parseCurrencyInput(draft.monthlyPrice),
          defaultEnabled: draft.defaultEnabled,
        }),
      });
      setMessage(`Módulo ${draft.name} atualizado.`);
      await loadWorkspace(true);
      if (activeCompany) {
        await loadDetail(activeCompany.id, drawerTab);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar módulo.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveMasterIntegrations() {
    setBusyAction("master-integrations-save");
    setError(null);
    try {
      await apiFetch("/modules/master/global-integrations", {
        method: "PUT",
        body: JSON.stringify({
          mercadoPagoLibrary: masterIntegrationsDraft.mercadoPagoLibrary,
          whatsappLibrary: masterIntegrationsDraft.whatsappLibrary,
        }),
      });
      setMessage("Biblioteca de credenciais do MASTER atualizada.");
      await loadWorkspace(true);
      if (activeCompany) {
        await loadDetail(activeCompany.id, drawerTab);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar os tokens globais do MASTER.");
    } finally {
      setBusyAction(null);
    }
  }

  async function setCompanyMasterTokenUsage(next: {
    useMasterMercadoPagoToken?: boolean;
    useMasterWhatsAppToken?: boolean;
    masterMercadoPagoCredentialKey?: string;
    masterWhatsAppCredentialKey?: string;
  }) {
    if (!activeCompany) return;
    setBusyAction(`master-token-usage-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${activeCompany.id}/global-token-usage`, {
        method: "PUT",
        body: JSON.stringify(next),
      });
      setMessage("Vínculo com token MASTER atualizado.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar o vínculo com o token MASTER.");
    } finally {
      setBusyAction(null);
    }
  }

  async function importActiveCompanyTokensToMaster(clearSource = true) {
    if (!activeCompany) return;
    setBusyAction(`import-master-tokens-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${activeCompany.id}/import-tokens-to-master`, {
        method: "POST",
        body: JSON.stringify({ clearSource }),
      });
      setMessage(`Tokens de ${activeCompany.name} importados para o MASTER.`);
      await refreshAll(activeCompany.id);
      setMasterIntegrationsOpen(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao importar tokens da empresa para o MASTER.");
    } finally {
      setBusyAction(null);
    }
  }

  function addMasterMercadoPagoCredential() {
    setMasterIntegrationsDraft((current) => ({
      ...current,
      mercadoPagoLibrary: [
        {
          key: createDraftKey("mp"),
          label: "Novo token de pagamentos",
          accessToken: "",
          configured: false,
          sourceCompanyId: null,
          sourceCompanyName: "MASTER",
        },
        ...current.mercadoPagoLibrary,
      ],
    }));
  }

  function addMasterWhatsAppCredential() {
    setMasterIntegrationsDraft((current) => ({
      ...current,
      whatsappLibrary: [
        {
          key: createDraftKey("wa"),
          label: "Novo token de WhatsApp",
          accessToken: "",
          phoneNumberId: "",
          wabaId: "",
          whatsappNumber: "",
          displayNumber: "",
          configured: false,
          sourceCompanyId: null,
          sourceCompanyName: "MASTER",
        },
        ...current.whatsappLibrary,
      ],
    }));
  }

  function updateMasterMercadoPagoCredential(credentialKey: string, patch: Partial<MasterMercadoPagoCredential>) {
    setMasterIntegrationsDraft((current) => ({
      ...current,
      mercadoPagoLibrary: current.mercadoPagoLibrary.map((credential) =>
        credential.key === credentialKey ? { ...credential, ...patch } : credential,
      ),
    }));
  }

  function updateMasterWhatsAppCredential(credentialKey: string, patch: Partial<MasterWhatsAppCredential>) {
    setMasterIntegrationsDraft((current) => ({
      ...current,
      whatsappLibrary: current.whatsappLibrary.map((credential) =>
        credential.key === credentialKey ? { ...credential, ...patch } : credential,
      ),
    }));
  }

  function removeMasterMercadoPagoCredential(credentialKey: string) {
    setMasterIntegrationsDraft((current) => ({
      ...current,
      mercadoPagoLibrary: current.mercadoPagoLibrary.filter((credential) => credential.key !== credentialKey),
    }));
  }

  function removeMasterWhatsAppCredential(credentialKey: string) {
    setMasterIntegrationsDraft((current) => ({
      ...current,
      whatsappLibrary: current.whatsappLibrary.filter((credential) => credential.key !== credentialKey),
    }));
  }

  async function assumeContext(company: CompanySummary) {
    setBusyAction(`context-${company.id}`);
    setError(null);
    try {
      await apiFetch("/master-context/assume", {
        method: "POST",
        headers: { "x-master-route": "/dashboard/master" },
        body: JSON.stringify({ companyId: company.id, reason: `Operacao no master: ${company.name}` }),
      });
      setMessage(`Contexto MASTER aplicado em ${company.name}.`);
      const [userPayload] = await Promise.all([
        apiFetch<CurrentUser>("/profile/current-user"),
        loadWorkspace(true),
      ]);
      setCurrentUser(userPayload);
      dispatchMasterContextChanged({ mode: "assumed", companyName: company.name });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao assumir contexto.");
    } finally {
      setBusyAction(null);
    }
  }

  async function exitContext() {
    setBusyAction("context-exit");
    setError(null);
    try {
      await apiFetch("/master-context/exit", {
        method: "POST",
        headers: { "x-master-route": "/dashboard/master" },
        body: JSON.stringify({ reason: "Saindo do contexto pela central master" }),
      });
      setMessage("Contexto MASTER encerrado.");
      const [userPayload] = await Promise.all([
        apiFetch<CurrentUser>("/profile/current-user"),
        loadWorkspace(true),
      ]);
      setCurrentUser(userPayload);
      dispatchMasterContextChanged({ mode: "exited", companyName: currentUser?.masterContext?.companyName || null });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao sair do contexto.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runTrialAction(companyId: number, body: Record<string, unknown>, successMessage: string) {
    setBusyAction(`trial-${companyId}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${companyId}/trial`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMessage(successMessage);
      await refreshAll(companyId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar trial.");
    } finally {
      setBusyAction(null);
    }
  }

  async function setPaymentStatus(companyId: number, paymentStatus: string, successMessage: string) {
    setBusyAction(`payment-${companyId}-${paymentStatus}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${companyId}/payment`, {
        method: "PUT",
        body: JSON.stringify({ paymentStatus }),
      });
      setMessage(successMessage);
      await refreshAll(companyId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar status financeiro.");
    } finally {
      setBusyAction(null);
    }
  }

  function openManualPayment(company: CompanySummary) {
    setManualPaymentModal({
      companyId: company.id,
      companyName: company.name,
      value: String(company.currentOutstandingValue || company.monthlyValue || 0),
      competence: new Date().toISOString().slice(0, 7),
      paidAt: toDatetimeLocalValue(new Date().toISOString()),
      dueDate: toDateInputValue(company.nextDueAt),
      paymentMethod: company.paymentMethod === "NONE" ? "PIX" : company.paymentMethod || "PIX",
      observation: "",
      settlePending: true,
      generateAudit: true,
    });
  }

  async function submitUserModal() {
    if (!userModal) return;
    setBusyAction(`user-${userModal.mode}`);
    setError(null);
    try {
      if (userModal.mode === "create") {
        await apiFetch(`/users/master/company/${userModal.companyId}/create`, {
          method: "POST",
          body: JSON.stringify({
            email: userModal.email.trim().toLowerCase(),
            username: userModal.username.trim() || undefined,
            role: userModal.role,
            password: userModal.password.trim() || undefined,
          }),
        });
        setMessage("Usuário criado com sucesso.");
      } else if (userModal.mode === "edit" && userModal.userId) {
        await apiFetch(`/users/master/${userModal.userId}`, {
          method: "PATCH",
          body: JSON.stringify({
            email: userModal.email.trim().toLowerCase(),
            username: userModal.username.trim(),
            role: userModal.role,
          }),
        });
        setMessage("Usuário atualizado com sucesso.");
      } else if (userModal.mode === "reset" && userModal.userId) {
        const payload = await apiFetch<{ temporaryPassword: string }>(
          `/users/master/${userModal.userId}/reset-password`,
          {
            method: "PATCH",
            body: JSON.stringify({ password: userModal.password.trim() || undefined }),
          },
        );
        setMessage(`Senha resetada. Nova senha: ${payload.temporaryPassword}`);
      }
      const companyId = userModal.companyId;
      setUserModal(null);
      await refreshAll(companyId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao processar usuário.");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteUser(companyId: number, userId: number, userLabel: string) {
    setBusyAction(`user-delete-${userId}`);
    setError(null);
    try {
      await apiFetch(`/users/master/${userId}/delete`, { method: "PATCH" });
      setMessage(`Usuário removido: ${userLabel}.`);
      await refreshAll(companyId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao deletar usuário.");
    } finally {
      setBusyAction(null);
    }
  }

  async function submitManualPayment() {
    if (!manualPaymentModal) return;
    setBusyAction("manual-payment");
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${manualPaymentModal.companyId}/manual-payment`, {
        method: "POST",
        body: JSON.stringify({
          value: Number(manualPaymentModal.value.replace(",", ".")),
          competence: manualPaymentModal.competence.trim(),
          paidAt: manualPaymentModal.paidAt ? new Date(manualPaymentModal.paidAt).toISOString() : undefined,
          dueDate: manualPaymentModal.dueDate ? new Date(`${manualPaymentModal.dueDate}T12:00:00`).toISOString() : undefined,
          paymentMethod: manualPaymentModal.paymentMethod,
          observation: manualPaymentModal.observation.trim() || undefined,
          settlePending: manualPaymentModal.settlePending,
          generateAudit: manualPaymentModal.generateAudit,
        }),
      });
      setMessage(`Pagamento manual registrado para ${manualPaymentModal.companyName}.`);
      const companyId = manualPaymentModal.companyId;
      setManualPaymentModal(null);
      await refreshAll(companyId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao lançar pagamento manual.");
    } finally {
      setBusyAction(null);
    }
  }

  async function cancelManualPayment(entryId: string) {
    if (!activeCompany) return;
    setBusyAction(`cancel-manual-${entryId}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${activeCompany.id}/manual-payment/${entryId}/cancel`, {
        method: "PUT",
        body: JSON.stringify({ observation: "Cancelado pela central master." }),
      });
      setMessage("Lançamento manual removido e preservado no histórico.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao remover lançamento manual.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveProfile() {
    if (!activeCompany || !profileDraft) return;
    setBusyAction(`profile-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${activeCompany.id}/profile`, {
        method: "PUT",
        body: JSON.stringify({
          name: profileDraft.name.trim(),
          primaryContactName: profileDraft.primaryContactName.trim() || undefined,
          contactEmail: profileDraft.contactEmail.trim() || undefined,
          contactPhone: profileDraft.contactPhone.trim() || undefined,
          taxDocument: profileDraft.taxDocument.trim() || undefined,
          paymentMethod: profileDraft.paymentMethod,
          subscriptionStatus: profileDraft.subscriptionStatus,
          billingProvider: profileDraft.billingProvider,
          premiumAccess: profileDraft.premiumAccess,
        }),
      });
      setMessage("Perfil financeiro salvo.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar perfil.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveWebsite() {
    if (!activeCompany || !websiteDraft) return;
    setBusyAction(`website-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/website/master/company/${activeCompany.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({
          websiteEnabled: websiteDraft.websiteEnabled,
          websitePublicUrl: websiteDraft.websitePublicUrl.trim() || undefined,
          websiteAdminUrl: websiteDraft.websiteAdminUrl.trim() || undefined,
          websiteProjectId: websiteDraft.websiteProjectId.trim() || undefined,
          websiteAdminEnabled: websiteDraft.websiteAdminEnabled,
          websiteLaunchMode: websiteDraft.websiteLaunchMode,
        }),
      });
      setMessage("Configuração do website salva.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar website.");
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleModule(companyId: number, moduleKey: string, enabled: boolean) {
    setBusyAction(`module-${companyId}-${moduleKey}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${companyId}`, {
        method: "PUT",
        body: JSON.stringify({ moduleKey, enabled: !enabled }),
      });
      setMessage("Módulo atualizado.");
      await refreshAll(companyId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar módulo.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveMercadoPagoConfig() {
    if (!activeCompany || !mercadoPagoDraft) return;
    setBusyAction(`mp-save-${activeCompany.id}`);
    setError(null);
    try {
      const payload = await apiFetch<{
        status: string;
        statusError: string | null;
        accountEmail: string | null;
        accountUserId: string | null;
        lastValidatedAt: string | null;
        accessTokenConfigured: boolean;
      }>(`/companies/master/${activeCompany.id}/mercadopago`, {
        method: "PATCH",
        body: JSON.stringify({ mercadoPagoAccessToken: mercadoPagoDraft.mercadoPagoAccessToken.trim() }),
      });
      setMercadoPagoDraft((current) =>
        current
          ? {
              ...current,
              mercadoPagoAccessToken: "",
              status: payload.status,
              statusError: payload.statusError,
              accountEmail: payload.accountEmail,
              accountUserId: payload.accountUserId,
              lastValidatedAt: payload.lastValidatedAt,
              accessTokenConfigured: payload.accessTokenConfigured,
            }
          : current,
      );
      setMessage("Token Mercado Pago salvo.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar token Mercado Pago.");
    } finally {
      setBusyAction(null);
    }
  }

  async function validateMercadoPagoConfig() {
    if (!activeCompany || !mercadoPagoDraft) return;
    setBusyAction(`mp-validate-${activeCompany.id}`);
    setError(null);
    try {
      const payload = await apiFetch<{
        status: string;
        statusError: string | null;
        accountEmail: string | null;
        accountUserId: string | null;
        lastValidatedAt: string | null;
        accessTokenConfigured: boolean;
      }>(`/companies/master/${activeCompany.id}/mercadopago/validate`, { method: "POST" });
      setMercadoPagoDraft((current) =>
        current
          ? {
              ...current,
              status: payload.status,
              statusError: payload.statusError,
              accountEmail: payload.accountEmail,
              accountUserId: payload.accountUserId,
              lastValidatedAt: payload.lastValidatedAt,
              accessTokenConfigured: payload.accessTokenConfigured,
            }
          : current,
      );
      setMessage("Validação Mercado Pago concluída.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao validar Mercado Pago.");
    } finally {
      setBusyAction(null);
    }
  }

  async function launchWebsite(companyId: number, target: "public" | "admin") {
    setBusyAction(`launch-${companyId}-${target}`);
    setError(null);
    try {
      const payload = await apiFetch<{ launchUrl?: string | null; message?: string | null }>(
        `/website/master/company/${companyId}/launch?target=${target}`,
      );
      const launchUrl = String(payload?.launchUrl || "").trim();
      if (!launchUrl) {
        throw new Error(payload?.message || "Website não configurado para esta empresa.");
      }
      window.open(launchUrl, "_blank", "noopener,noreferrer");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao abrir website.");
    } finally {
      setBusyAction(null);
    }
  }

  if (hasToken === null) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando central master...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  const summary = workspace?.summary || {};

  return (
    <DashboardScaffold
      title="Master Command Center"
      description="Operação premium do HBX com foco financeiro, contexto da empresa ativa e ações seguras."
      actions={
        <div className={styles.heroActions}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateCompanyOpen(true)}>
            Nova empresa
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMasterIntegrationsOpen(true)}>
            Tokens MASTER
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModuleCatalogOpen(true)}>
            Módulos
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadWorkspace(true)}>
            {refreshing ? "Atualizando..." : "Atualizar"}
          </button>
          <Link href="/dashboard/master/assistente-tecnico" className="btn btn-secondary btn-sm">
            Assistente Técnico
          </Link>
          <Link href="/dashboard/master/exclusoes" className="btn btn-secondary btn-sm">
            Exclusões
          </Link>
        </div>
      }
    >
      <div className={styles.masterPage}>
        <section className={styles.commandBar}>
          <div className={styles.commandSearch}>
            <label className={styles.commandLabel}>Busca global</label>
            <input
              className="field"
              placeholder="Buscar empresa, contato, plano ou módulo..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className={styles.commandQuick}>
            <label className={styles.commandLabel}>Empresa rápida</label>
            <div className={styles.quickRow}>
              <select className="field" value={quickCompanyId} onChange={(event) => setQuickCompanyId(event.target.value)}>
                {(workspace?.companies || []).map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!quickCompanyTarget} onClick={() => quickCompanyTarget && openCompany(quickCompanyTarget.id)}>
                Abrir
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!quickCompanyTarget} onClick={() => quickCompanyTarget && assumeContext(quickCompanyTarget)}>
                Contexto
              </button>
            </div>
          </div>
          <div className={styles.commandAlerts}>
            <span className={badgeClass(workspace?.attention.some((item) => item.severity === "danger") ? "danger" : "brand")}>
              {workspace?.attention.length || 0} alertas
            </span>
            <strong>{workspace?.attention[0]?.title || "Fila operacional sob controle"}</strong>
            <p>{workspace?.attention[0] ? "Use os cards abaixo para agir rápido." : "Nenhuma ação crítica pendente."}</p>
          </div>
          <div className={styles.commandUser}>
            <div className={styles.avatarToken}>{initials(currentUser?.username || currentUser?.email)}</div>
            <div>
              <strong>{currentUser?.username || currentUser?.email || "MASTER"}</strong>
              <p>
                {currentUser?.masterContext?.active
                  ? `Operando em ${currentUser.masterContext.companyName || "empresa"}`
                  : "MASTER puro"}
              </p>
            </div>
            {currentUser?.masterContext?.active ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={exitContext}>
                Sair do contexto
              </button>
            ) : null}
          </div>
        </section>

        {error ? <div className="alert alert-error">{error}</div> : null}
        {message ? <div className="msg-info"><div className="text-sm">{message}</div></div> : null}
        {loading ? (
          <div className={styles.loadingGrid}>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className={styles.skeletonCard} />
            ))}
          </div>
        ) : (
          <>
            <section className={styles.metricsGrid}>
              <MetricCard title="Receita confirmada do mês" metric={summary.confirmedRevenueMonth} accent="navy" />
              <MetricCard title="Receita prevista do mês" metric={summary.projectedRevenueMonth} accent="emerald" />
              <MetricCard title="Receita líquida do mês" metric={summary.netRevenueMonth} accent="sun" />
              <MetricCard title="Inadimplência atual" metric={summary.delinquencyCurrent} accent="rose" />
              <MetricCard title="Trials ativos" metric={summary.activeTrials} accent="amber" />
              <MetricCard title="Clientes pagantes" metric={summary.payingClients} accent="mint" />
              <MetricCard title="Cartões com falha" metric={summary.recentCardFailures} accent="crimson" />
              <MetricCard title="Pagamentos manuais" metric={summary.manualPaymentsMonth} accent="slate" />
            </section>

            <section className={styles.chartsGrid}>
              <RevenueChart points={workspace?.charts.revenue || []} />
              <PaymentChart
                points={workspace?.charts.payments || []}
                mode={paymentMode}
                onModeChange={setPaymentMode}
              />
              <DistributionCard
                eyebrow="Base ativa"
                title="Status da base"
                points={(workspace?.charts.baseStatus || []).map((item) => ({
                  label: item.label,
                  value: item.value,
                }))}
              />
              <DistributionCard
                eyebrow="Conversão"
                title="Trials e conversão"
                points={[
                  { label: "Trials ativos", value: workspace?.charts.trialConversion.active || 0 },
                  { label: "Convertidos", value: workspace?.charts.trialConversion.converted || 0 },
                  { label: "Expirados", value: workspace?.charts.trialConversion.expired || 0 },
                  { label: "Prorrogações", value: workspace?.charts.trialConversion.extended || 0 },
                ]}
              />
              <DistributionCard
                eyebrow="Receita por módulo"
                title="Receita estimada"
                points={workspace?.charts.revenueByModule || []}
                currency
              />
            </section>

            <section className={styles.attentionSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Ação imediata</p>
                  <h2>Precisa da sua atenção agora</h2>
                </div>
              </div>
              <div className={styles.attentionGrid}>
                {(workspace?.attention || []).length ? (
                  workspace?.attention.map((item) => (
                    <article key={item.id} className={styles.attentionCard} data-tone={item.severity}>
                      <div className={styles.attentionCardHeader}>
                        <span className={badgeClass(item.severity === "danger" ? "danger" : item.severity === "warning" ? "brand" : "neutral")}>
                          {item.count}
                        </span>
                        <strong>{item.title}</strong>
                      </div>
                      <div className={styles.attentionList}>
                        {item.companies.map((company) => (
                          <button
                            key={company.id}
                            type="button"
                            className={styles.attentionRow}
                            onClick={() => openCompany(company.id, company.statusBucket === "OVERDUE" ? "finance" : "summary")}
                          >
                            <div>
                              <strong>{company.name}</strong>
                              <span>{bucketLabel(company.statusBucket)}</span>
                            </div>
                            <span>{company.trialRemainingDays != null ? `${company.trialRemainingDays}d` : formatDate(company.nextDueAt)}</span>
                          </button>
                        ))}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className={styles.emptyPanel}>Nenhuma ação crítica no momento.</div>
                )}
              </div>
            </section>

            <section className={styles.tableSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Operação diária</p>
                  <h2>Empresas</h2>
                </div>
                <div className={styles.filterChips}>
                  {FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      className={filterId === filter.id ? styles.filterChipActive : styles.filterChip}
                      onClick={() => setFilterId(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.tableControls}>
                <select className="field" value={sortId} onChange={(event) => setSortId(event.target.value)}>
                  <option value="risk">Ordenar por risco</option>
                  <option value="due">Ordenar por vencimento</option>
                  <option value="revenue">Ordenar por receita</option>
                  <option value="name">Ordenar por nome</option>
                </select>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.masterTable}>
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Responsável</th>
                      <th>Status</th>
                      <th>Plano</th>
                      <th>Trial</th>
                      <th>Próx. vencimento</th>
                      <th>Último pagamento</th>
                      <th>Método</th>
                      <th>Situação</th>
                      <th>Website</th>
                      <th>Módulos</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompanies.map((company) => (
                      <tr key={company.id}>
                        <td>
                          <button type="button" className={styles.companyCell} onClick={() => openCompany(company.id)}>
                            <strong>{company.name}</strong>
                            <span>#{company.id}{company.slug ? ` • ${company.slug}` : ""}</span>
                          </button>
                        </td>
                        <td>
                          <div className={styles.secondaryCell}>
                            <strong>{company.primaryContactName || "-"}</strong>
                            <span>{company.contactEmail || company.contactPhone || "Sem contato principal"}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.statusStack}>
                            <span className={badgeClass(statusTone(company.statusBucket))}>{bucketLabel(company.statusBucket)}</span>
                            <span>{paymentStatusLabel(company.paymentStatus)}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.secondaryCell}>
                            <strong>{company.plan?.name || "Sem plano"}</strong>
                            <span>{formatCurrency(company.monthlyValue)}</span>
                          </div>
                        </td>
                        <td>{company.trialRemainingDays != null ? `${company.trialRemainingDays} dia(s)` : "-"}</td>
                        <td>{formatDate(company.nextDueAt)}</td>
                        <td>{company.lastPayment ? formatDate(company.lastPayment.paidAt) : "Sem histórico"}</td>
                        <td>{paymentMethodLabel(company.paymentMethod)}</td>
                        <td>{company.financialSituation}</td>
                        <td>
                          <span className={badgeClass(company.website.configured ? "success" : company.websiteNeedsAttention ? "danger" : "neutral")}>
                            {company.website.configured ? "Configurado" : "Pendente"}
                          </span>
                        </td>
                        <td>
                          <div className={styles.modulePills}>
                            {company.modules.slice(0, 2).map((module) => (
                              <span key={module.key} className="badge">{module.name}</span>
                            ))}
                            {company.modules.length > 2 ? <span className="badge">+{company.modules.length - 2}</span> : null}
                          </div>
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openCompany(company.id)}>
                              Abrir
                            </button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openManualPayment(company)}>
                              Manual
                            </button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => assumeContext(company)}>
                              Contexto
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredCompanies.length ? <div className={styles.emptyPanel}>Nenhuma empresa encontrada para o filtro atual.</div> : null}
              </div>
            </section>
          </>
        )}
      </div>

      <div className={styles.drawerRoot} data-open={drawerOpen}>
        <button type="button" className={styles.drawerBackdrop} onClick={() => setDrawerOpen(false)} aria-label="Fechar detalhes" />
        <aside className={styles.drawerPanel}>
          {detailLoading ? <div className={styles.drawerLoading}>Carregando empresa...</div> : null}
          {!detailLoading && activeCompany ? (
            <>
              <header className={styles.drawerHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Empresa ativa no detalhe</p>
                  <h2>{activeCompany.name}</h2>
                  <div className={styles.drawerBadges}>
                    <span className={badgeClass(statusTone(activeCompany.statusBucket))}>{bucketLabel(activeCompany.statusBucket)}</span>
                    <span className="badge">{activeCompany.plan?.name || "Sem plano"}</span>
                    <span className="badge">{paymentMethodLabel(activeCompany.paymentMethod)}</span>
                  </div>
                </div>
                <button type="button" className={styles.iconButton} onClick={() => setDrawerOpen(false)}>Fechar</button>
              </header>

              <div className={activeContextCompanyId === activeCompany.id ? styles.contextBannerActive : styles.contextBanner}>
                <strong>Você está operando esta empresa</strong>
                <span>
                  {activeContextCompanyId === activeCompany.id
                    ? `${activeCompany.name} está assumida no contexto MASTER.`
                    : "Assuma o contexto correto antes de criar usuários ou abrir o admin do website."}
                </span>
                {activeContextCompanyId !== activeCompany.id ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => assumeContext(activeCompany)}>
                    Assumir contexto
                  </button>
                ) : null}
              </div>

              <nav className={styles.drawerTabs}>
                {TABS.map((tab) => (
                  <button key={tab.id} type="button" className={drawerTab === tab.id ? styles.drawerTabActive : styles.drawerTab} onClick={() => setDrawerTab(tab.id)}>
                    {tab.label}
                  </button>
                ))}
              </nav>

              <div className={styles.drawerBody}>
                {drawerTab === "finance" ? (
                <section className={styles.summaryCard}>
                  <div className={styles.summaryStats}>
                    <div><span>Mensalidade</span><strong>{formatCurrency(activeCompany.monthlyValue)}</strong></div>
                    <div><span>Próxima cobrança</span><strong>{formatDate(activeCompany.nextDueAt)}</strong></div>
                    <div><span>Último pagamento</span><strong>{activeCompany.lastPayment ? formatDate(activeCompany.lastPayment.paidAt) : "Sem histórico"}</strong></div>
                    <div><span>Dias em atraso</span><strong>{activeCompany.daysOverdue}</strong></div>
                  </div>
                  <div className={styles.drawerQuickActions}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => openManualPayment(activeCompany)}>Lançar pagamento manual</button>
                    <input className="field" type="number" min="1" max="365" value={trialDaysDraft} onChange={(event) => setTrialDaysDraft(event.target.value)} />
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!Number(trialDaysDraft)} onClick={() => runTrialAction(activeCompany.id, { action: "extend", days: Number(trialDaysDraft) }, `Trial prorrogado em ${trialDaysDraft} dias.`)}>Aplicar dias</button>
                    <input className="field" type="date" value={trialDateDraft} onChange={(event) => setTrialDateDraft(event.target.value)} />
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!trialDateDraft} onClick={() => runTrialAction(activeCompany.id, { action: "set_date", endsAt: `${trialDateDraft}T12:00:00` }, "Data do trial atualizada.")}>Definir data</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPaymentStatus(activeCompany.id, "PAID", "Cliente marcado como pago.")}>Marcar pago</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmAction({
                      title: "Suspender cliente",
                      description: `Isso vai suspender ${activeCompany.name} e desativar seus módulos.`,
                      confirmLabel: "Suspender cliente",
                      tone: "danger",
                      run: async () => {
                        setConfirmAction(null);
                        await setPaymentStatus(activeCompany.id, "DISABLED", "Cliente suspenso.");
                      },
                    })}>Suspender</button>
                  </div>
                </section>
                ) : null}

                {drawerTab === "summary" ? (
                  <section className={styles.summaryCard}>
                    <div className={styles.panelCardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Resumo operacional</p>
                        <h3>Contexto completo da empresa ativa</h3>
                      </div>
                      <div className={styles.rowActions}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openCompany(activeCompany.id, "finance")}>
                          Ver pagamentos
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDrawerTab("audit")}>
                          Ver auditoria
                        </button>
                      </div>
                    </div>
                    <div className={styles.summaryMeta}>
                      <p>Responsável: {activeCompany.primaryContactName || "Não definido"}</p>
                      <p>Contato: {activeCompany.contactEmail || activeCompany.contactPhone || "Sem contato principal"}</p>
                      <p>Plano: {activeCompany.plan?.name || "Sem plano"} • {formatCurrency(activeCompany.monthlyValue)}</p>
                      <p>Cobrança: {subscriptionLabel(activeCompany.subscriptionStatus)} • {paymentMethodLabel(activeCompany.paymentMethod)}</p>
                      <p>Website: {activeCompany.website.enabled ? "Habilitado" : "Desligado"} • {activeCompany.website.configured ? "Configurado" : "Pendente"}</p>
                      <p>Módulos ativos: {activeCompany.modules.filter((module) => module.enabled).map((module) => module.name).join(", ") || "Nenhum módulo ativo"}</p>
                    </div>
                    <div className={styles.summaryStats}>
                      <div><span>Trial inicia</span><strong>{formatDate(activeCompany.trialStartsAt)}</strong></div>
                      <div><span>Trial termina</span><strong>{formatDate(activeCompany.trialEndsAt)}</strong></div>
                      <div><span>Trial restante</span><strong>{activeCompany.trialRemainingDays != null ? `${activeCompany.trialRemainingDays} dia(s)` : "-"}</strong></div>
                      <div><span>Valor em aberto</span><strong>{formatCurrency(activeCompany.currentOutstandingValue)}</strong></div>
                    </div>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => runTrialAction(activeCompany.id, { action: "reactivate", days: 7 }, "Trial reativado por 7 dias.")}
                      >
                        Reativar trial
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setConfirmAction({
                          title: "Encerrar trial",
                          description: `O trial de ${activeCompany.name} será encerrado agora.`,
                          confirmLabel: "Encerrar trial",
                          tone: "danger",
                          run: async () => {
                            setConfirmAction(null);
                            await runTrialAction(activeCompany.id, { action: "end" }, "Trial encerrado.");
                          },
                        })}
                      >
                        Encerrar trial
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => launchWebsite(activeCompany.id, "public")}>
                        Abrir website
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => launchWebsite(activeCompany.id, "admin")}>
                        Abrir admin
                      </button>
                    </div>
                    <div className={styles.timeline}>
                      {activeCompany.trialHistory.length ? (
                        activeCompany.trialHistory.map((entry) => (
                          <article key={entry.id} className={styles.timelineItem}>
                            <div className={styles.timelineDot} />
                            <div>
                              <div className={styles.timelineTopline}>
                                <strong>{entry.action}</strong>
                                <span>{formatDateTime(entry.createdAt)}</span>
                              </div>
                              <p>{entry.scope}</p>
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className={styles.emptyPanel}>Nenhum histórico de trial para esta empresa.</div>
                      )}
                    </div>
                  </section>
                ) : null}

                {drawerTab === "finance" ? (
                  <section className={styles.summaryCard}>
                    <div className={styles.panelCardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Financeiro</p>
                        <h3>Configuração financeira e histórico</h3>
                      </div>
                      <div className={styles.rowActions}>
                        <button type="button" className="btn btn-primary btn-sm" onClick={saveProfile}>
                          Salvar financeiro
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            const csv = buildCsv(activeCompany);
                            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = `master-financeiro-${activeCompany.slug || activeCompany.id}.csv`;
                            document.body.appendChild(link);
                            link.click();
                            link.remove();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Exportar histórico
                        </button>
                      </div>
                    </div>
                    <div className={styles.formGrid}>
                      <input className="field" placeholder="Nome da empresa" value={profileDraft?.name || ""} onChange={(event) => setProfileDraft((current) => current ? { ...current, name: event.target.value } : current)} />
                      <input className="field" placeholder="Responsável" value={profileDraft?.primaryContactName || ""} onChange={(event) => setProfileDraft((current) => current ? { ...current, primaryContactName: event.target.value } : current)} />
                      <input className="field" placeholder="E-mail" value={profileDraft?.contactEmail || ""} onChange={(event) => setProfileDraft((current) => current ? { ...current, contactEmail: event.target.value } : current)} />
                      <input className="field" placeholder="Telefone" value={profileDraft?.contactPhone || ""} onChange={(event) => setProfileDraft((current) => current ? { ...current, contactPhone: event.target.value } : current)} />
                      <input className="field" placeholder="CPF/CNPJ" value={profileDraft?.taxDocument || ""} onChange={(event) => setProfileDraft((current) => current ? { ...current, taxDocument: event.target.value } : current)} />
                      <select className="field" value={profileDraft?.paymentMethod || "NONE"} onChange={(event) => setProfileDraft((current) => current ? { ...current, paymentMethod: event.target.value } : current)}>
                        <option value="NONE">Sem método</option>
                        <option value="CARD">Cartão</option>
                        <option value="PIX">Pix</option>
                        <option value="BOLETO">Boleto</option>
                        <option value="MANUAL">Manual</option>
                      </select>
                      <select className="field" value={profileDraft?.subscriptionStatus || "trialing"} onChange={(event) => setProfileDraft((current) => current ? { ...current, subscriptionStatus: event.target.value } : current)}>
                        <option value="trialing">Trial</option>
                        <option value="active">Ativa</option>
                        <option value="past_due">Em atraso</option>
                        <option value="canceled">Cancelada</option>
                        <option value="expired">Expirada</option>
                      </select>
                      <select className="field" value={profileDraft?.billingProvider || "manual"} onChange={(event) => setProfileDraft((current) => current ? { ...current, billingProvider: event.target.value } : current)}>
                        <option value="manual">manual</option>
                        <option value="mercadopago">mercadopago</option>
                        <option value="stripe">stripe</option>
                        <option value="apple">apple</option>
                        <option value="google">google</option>
                      </select>
                      <label className={styles.checkboxCard}>
                        <input type="checkbox" checked={Boolean(profileDraft?.premiumAccess)} onChange={(event) => setProfileDraft((current) => current ? { ...current, premiumAccess: event.target.checked } : current)} />
                        Liberar acesso operacional mesmo fora da régua automática
                      </label>
                    </div>
                    <div className={styles.historyTableWrap}>
                      <table className={styles.historyTable}>
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Competência</th>
                            <th>Valor</th>
                            <th>Vencimento</th>
                            <th>Pagamento</th>
                            <th>Status</th>
                            <th>Origem</th>
                            <th>Método</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeCompany.financeHistory.map((entry) => (
                            <tr key={entry.id}>
                              <td>{entry.id.slice(0, 8)}</td>
                              <td>{entry.competence || "-"}</td>
                              <td>{formatCurrency(entry.amount)}</td>
                              <td>{formatDate(entry.dueDate)}</td>
                              <td>{formatDateTime(entry.paidAt)}</td>
                              <td><span className="badge">{entry.status}</span></td>
                              <td>{entry.origin || entry.entryType}</td>
                              <td>{paymentMethodLabel(entry.paymentMethod)}</td>
                              <td>
                                {String(entry.origin || "").toLowerCase() === "master_manual_payment" ? (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() =>
                                      setConfirmAction({
                                        title: "Remover lançamento manual",
                                        description: `O lançamento ${entry.id.slice(0, 8)} será marcado como cancelado e continuará no histórico.`,
                                        confirmLabel: "Remover lançamento",
                                        tone: "danger",
                                        run: async () => {
                                          setConfirmAction(null);
                                          await cancelManualPayment(entry.id);
                                        },
                                      })
                                    }
                                  >
                                    Remover
                                  </button>
                                ) : (
                                  "-"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : null}

                {drawerTab === "users" ? (
                  <section className={styles.summaryCard}>
                    <div className={styles.panelCardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Segurança operacional</p>
                        <h3>Usuários</h3>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() =>
                          setUserModal({
                            mode: "create",
                            companyId: activeCompany.id,
                            companyName: activeCompany.name,
                            email: "",
                            username: "",
                            role: "USER",
                            password: "",
                          })
                        }
                      >
                        Criar usuário
                      </button>
                    </div>
                    <div className={styles.userList}>
                      {activeCompany.users.map((user) => (
                        <article key={user.id} className={styles.userCard}>
                          <div>
                            <strong>{user.username || user.email || `#${user.id}`}</strong>
                            <p>{user.email || "Sem e-mail"}</p>
                          </div>
                          <div className={styles.modulePills}>
                            <span className="badge">{user.role}</span>
                            <span className={badgeClass(user.isActive ? "success" : "danger")}>{user.isActive ? "Ativo" : "Inativo"}</span>
                          </div>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() =>
                                setUserModal({
                                  mode: "edit",
                                  companyId: activeCompany.id,
                                  companyName: activeCompany.name,
                                  userId: user.id,
                                  userLabel: user.username || user.email || `#${user.id}`,
                                  email: user.email || "",
                                  username: user.username || "",
                                  role: user.role === "ADMIN" || user.role === "GERENTE" ? user.role : "USER",
                                  password: "",
                                })
                              }
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() =>
                                setUserModal({
                                  mode: "reset",
                                  companyId: activeCompany.id,
                                  companyName: activeCompany.name,
                                  userId: user.id,
                                  userLabel: user.username || user.email || `#${user.id}`,
                                  email: user.email || "",
                                  username: user.username || "",
                                  role: user.role === "ADMIN" || user.role === "GERENTE" ? user.role : "USER",
                                  password: "",
                                })
                              }
                            >
                              Resetar senha
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() =>
                                setConfirmAction({
                                  title: "Deletar usuário",
                                  description: `O usuário ${user.username || user.email || `#${user.id}`} será removido desta empresa.`,
                                  confirmLabel: "Deletar usuário",
                                  tone: "danger",
                                  run: async () => {
                                    setConfirmAction(null);
                                    await deleteUser(activeCompany.id, user.id, user.username || user.email || `#${user.id}`);
                                  },
                                })
                              }
                            >
                              Deletar
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {drawerTab === "modules" ? (
                  <section className={styles.summaryCard}>
                    <div className={styles.panelCardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Produtos habilitados</p>
                        <h3>Módulos</h3>
                      </div>
                      <div className={styles.summaryMeta}>
                        <p>Total mensal dos ativos: {formatCurrency(activeCompany.modules.filter((module) => module.enabled).reduce((total, module) => total + Number(module.monthlyPrice || 0), 0))}</p>
                      </div>
                    </div>
                    <div className={styles.moduleList}>
                      {activeCompany.modules.map((module) => (
                        <label key={module.key} className={styles.moduleToggle}>
                          <div>
                            <strong>{module.name}</strong>
                            <p>{module.key} • {formatCurrency(module.monthlyPrice || 0)}/mês</p>
                          </div>
                          <button type="button" className={module.enabled ? styles.toggleOn : styles.toggleOff} onClick={() => toggleModule(activeCompany.id, module.key, module.enabled)}>
                            {module.enabled ? "Ativo" : "Desativado"}
                          </button>
                        </label>
                      ))}
                    </div>
                  </section>
                ) : null}

                {drawerTab === "website" ? (
                  <section className={styles.summaryCard}>
                    <div className={styles.panelCardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Website</p>
                        <h3>Configuração do website</h3>
                      </div>
                      <button type="button" className="btn btn-primary btn-sm" onClick={saveWebsite}>
                        Salvar website
                      </button>
                    </div>
                    <div className={styles.formGrid}>
                      <label className={styles.checkboxCard}>
                        <input type="checkbox" checked={Boolean(websiteDraft?.websiteEnabled)} onChange={(event) => setWebsiteDraft((current) => current ? { ...current, websiteEnabled: event.target.checked } : current)} />
                        Website habilitado
                      </label>
                      <label className={styles.checkboxCard}>
                        <input type="checkbox" checked={Boolean(websiteDraft?.websiteAdminEnabled)} onChange={(event) => setWebsiteDraft((current) => current ? { ...current, websiteAdminEnabled: event.target.checked } : current)} />
                        Admin habilitado
                      </label>
                      <select className="field" value={websiteDraft?.websiteLaunchMode || "public"} onChange={(event) => setWebsiteDraft((current) => current ? { ...current, websiteLaunchMode: event.target.value === "admin" ? "admin" : "public" } : current)}>
                        <option value="public">Abrir site público</option>
                        <option value="admin">Abrir admin</option>
                      </select>
                      <input className="field" placeholder="URL pública" value={websiteDraft?.websitePublicUrl || ""} onChange={(event) => setWebsiteDraft((current) => current ? { ...current, websitePublicUrl: event.target.value } : current)} />
                      <input className="field" placeholder="Project ID" value={websiteDraft?.websiteProjectId || ""} onChange={(event) => setWebsiteDraft((current) => current ? { ...current, websiteProjectId: event.target.value } : current)} />
                      <input className="field" placeholder="URL do admin" value={websiteDraft?.websiteAdminUrl || ""} onChange={(event) => setWebsiteDraft((current) => current ? { ...current, websiteAdminUrl: event.target.value } : current)} />
                    </div>
                    <div className={styles.rowActions}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => launchWebsite(activeCompany.id, "public")}>Abrir website</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => launchWebsite(activeCompany.id, "admin")}>Abrir admin</button>
                    </div>
                  </section>
                ) : null}

                {drawerTab === "integrations" ? (
                  <section className={styles.summaryCard}>
                    <div className={styles.panelCardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Integrações</p>
                        <h3>Mercado Pago e WhatsApp com credenciais MASTER</h3>
                      </div>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMasterIntegrationsOpen(true)}>
                        Editar credenciais MASTER
                      </button>
                    </div>
                    <div className={styles.summaryMeta}>
                      <p>Mercado Pago: {mercadoPagoDraft?.status || activeCompany.mercadoPago.status || "Sem status"}</p>
                      <p>Conta MP: {mercadoPagoDraft?.accountEmail || activeCompany.mercadoPago.accountEmail || "-"}</p>
                      <p>Pagamentos MASTER: {workspace?.masterIntegrations?.mercadoPagoLibrary.length || 0} credenciais</p>
                      <p>WhatsApps configurados: {activeCompany.whatsapp.endpoints.length}</p>
                      <p>WhatsApp MASTER: {workspace?.masterIntegrations?.whatsappLibrary.length || 0} credenciais</p>
                    </div>
                    <div className={styles.userCard}>
                      <div className={styles.panelCardHeader}>
                        <div>
                          <strong>Mercado Pago da empresa</strong>
                          <p>Checkout por cartão e webhook financeiro desta empresa. Você pode trocar para o token global do MASTER.</p>
                        </div>
                        <div className={styles.rowActions}>
                          <label className={styles.inlineCheck}>
                            <input
                              type="checkbox"
                              checked={Boolean(activeCompany.mercadoPago.usingMasterToken)}
                              onChange={() =>
                                void setCompanyMasterTokenUsage({
                                  useMasterMercadoPagoToken: !activeCompany.mercadoPago.usingMasterToken,
                                  masterMercadoPagoCredentialKey:
                                    activeCompany.mercadoPago.masterCredentialKey ||
                                    workspace?.masterIntegrations?.mercadoPagoLibrary.find((item) => item.configured)?.key,
                                })
                              }
                              disabled={
                                busyAction === `master-token-usage-${activeCompany.id}` ||
                                (!activeCompany.mercadoPago.usingMasterToken &&
                                  !workspace?.masterIntegrations?.mercadoPagoLibrary.some((item) => item.configured))
                              }
                            />
                            <span>Usar credencial MASTER</span>
                          </label>
                          <button type="button" className={styles.iconOnlyButton} onClick={() => setIntegrationVisibility((current) => ({ ...current, mercadopago: !current.mercadopago }))} aria-label="Ver token da empresa">
                            <EyeIcon />
                          </button>
                        </div>
                      </div>
                      <div className={styles.modulePills}>
                        <span className={badgeClass(activeCompany.mercadoPago.usingMasterToken ? "success" : "warning")}>
                          {activeCompany.mercadoPago.usingMasterToken ? "Usando credencial MASTER" : "Usando token próprio"}
                        </span>
                        <span className="badge">
                          {activeCompany.mercadoPago.masterCredentialLabel || "Nenhuma credencial selecionada"}
                        </span>
                      </div>
                      <select
                        className="field"
                        value={activeCompany.mercadoPago.masterCredentialKey || ""}
                        onChange={(event) =>
                          void setCompanyMasterTokenUsage({
                            masterMercadoPagoCredentialKey: event.target.value || undefined,
                            useMasterMercadoPagoToken: true,
                          })
                        }
                        disabled={!workspace?.masterIntegrations?.mercadoPagoLibrary.length}
                      >
                        <option value="">Selecionar credencial MASTER de pagamentos</option>
                        {(workspace?.masterIntegrations?.mercadoPagoLibrary || []).map((credential) => (
                          <option key={credential.key} value={credential.key}>
                            {credential.label} {credential.sourceCompanyName ? `• ${credential.sourceCompanyName}` : ""}
                          </option>
                        ))}
                      </select>
                      <input className="field" placeholder="Cole o access token do Mercado Pago" value={mercadoPagoDraft?.mercadoPagoAccessToken || ""} onChange={(event) => setMercadoPagoDraft((current) => current ? { ...current, mercadoPagoAccessToken: event.target.value } : current)} />
                      {integrationVisibility.mercadopago && activeCompany.mercadoPago.accessTokenValue ? (
                        <div className="msg-info"><div className="text-sm">{activeCompany.mercadoPago.accessTokenValue}</div></div>
                      ) : null}
                      {activeCompany.mercadoPago.masterTokenConfigured ? (
                        <div className="msg-info">
                          <div className="text-sm">
                            Token MASTER pronto para uso nesta empresa.
                            {integrationVisibility.master_mp && activeCompany.mercadoPago.masterAccessTokenValue
                              ? ` ${activeCompany.mercadoPago.masterAccessTokenValue}`
                              : ""}
                          </div>
                          <button type="button" className={styles.iconOnlyButton} onClick={() => setIntegrationVisibility((current) => ({ ...current, master_mp: !current.master_mp }))} aria-label="Ver token master de Mercado Pago">
                            <EyeIcon />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {mercadoPagoDraft?.statusError ? <div className="alert alert-error">{mercadoPagoDraft.statusError}</div> : null}
                    <div className={styles.rowActions}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={validateMercadoPagoConfig}>Validar token</button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={saveMercadoPagoConfig}>Salvar token</button>
                    </div>
                    <div className={styles.userCard}>
                      <div className={styles.panelCardHeader}>
                        <div>
                          <strong>WhatsApp da empresa</strong>
                          <p>Use o token global do MASTER para onboarding e operação guiada da empresa.</p>
                        </div>
                        <div className={styles.rowActions}>
                          <label className={styles.inlineCheck}>
                            <input
                              type="checkbox"
                              checked={Boolean(activeCompany.whatsapp.usingMasterToken)}
                              onChange={() =>
                                void setCompanyMasterTokenUsage({
                                  useMasterWhatsAppToken: !activeCompany.whatsapp.usingMasterToken,
                                  masterWhatsAppCredentialKey:
                                    activeCompany.whatsapp.masterCredentialKey ||
                                    workspace?.masterIntegrations?.whatsappLibrary.find((item) => item.configured)?.key,
                                })
                              }
                              disabled={
                                busyAction === `master-token-usage-${activeCompany.id}` ||
                                (!activeCompany.whatsapp.usingMasterToken &&
                                  !workspace?.masterIntegrations?.whatsappLibrary.some((item) => item.configured))
                              }
                            />
                            <span>Usar credencial MASTER</span>
                          </label>
                          <button type="button" className={styles.iconOnlyButton} onClick={() => setIntegrationVisibility((current) => ({ ...current, whatsapp_company: !current.whatsapp_company }))} aria-label="Ver token de WhatsApp da empresa">
                            <EyeIcon />
                          </button>
                        </div>
                      </div>
                      <div className={styles.modulePills}>
                        <span className={badgeClass(activeCompany.whatsapp.usingMasterToken ? "success" : "warning")}>
                          {activeCompany.whatsapp.usingMasterToken ? "Usando credencial MASTER" : "Usando token próprio"}
                        </span>
                        <span className="badge">
                          {activeCompany.whatsapp.masterCredentialLabel || "Nenhuma credencial selecionada"}
                        </span>
                      </div>
                      <select
                        className="field"
                        value={activeCompany.whatsapp.masterCredentialKey || ""}
                        onChange={(event) =>
                          void setCompanyMasterTokenUsage({
                            masterWhatsAppCredentialKey: event.target.value || undefined,
                            useMasterWhatsAppToken: true,
                          })
                        }
                        disabled={!workspace?.masterIntegrations?.whatsappLibrary.length}
                      >
                        <option value="">Selecionar credencial MASTER de WhatsApp</option>
                        {(workspace?.masterIntegrations?.whatsappLibrary || []).map((credential) => (
                          <option key={credential.key} value={credential.key}>
                            {credential.label} {credential.sourceCompanyName ? `• ${credential.sourceCompanyName}` : ""}
                          </option>
                        ))}
                      </select>
                      {integrationVisibility.whatsapp_company && activeCompany.whatsapp.companyAccessTokenValue ? (
                        <div className="msg-info"><div className="text-sm">{activeCompany.whatsapp.companyAccessTokenValue}</div></div>
                      ) : null}
                      {activeCompany.whatsapp.masterAccessTokenConfigured ? (
                        <div className="msg-info">
                          <div className="text-sm">
                            Número MASTER: {activeCompany.whatsapp.masterDisplayNumber || "-"} • Phone ID: {activeCompany.whatsapp.masterPhoneNumberId || "-"}
                            {integrationVisibility.whatsapp_master && activeCompany.whatsapp.masterAccessTokenValue
                              ? ` • Token: ${activeCompany.whatsapp.masterAccessTokenValue}`
                              : ""}
                          </div>
                          <button type="button" className={styles.iconOnlyButton} onClick={() => setIntegrationVisibility((current) => ({ ...current, whatsapp_master: !current.whatsapp_master }))} aria-label="Ver token master de WhatsApp">
                            <EyeIcon />
                          </button>
                        </div>
                      ) : (
                        <div className="msg-info"><div className="text-sm">Cadastre ao menos uma credencial de WhatsApp no MASTER para habilitar o uso herdado nesta empresa.</div></div>
                      )}
                    </div>
                    <div className={styles.userList}>
                      {activeCompany.whatsapp.endpoints.map((endpoint) => (
                        <article key={endpoint.id} className={styles.userCard}>
                          <div>
                            <strong>{endpoint.label || endpoint.whatsappDisplayNumber || "Entrada WhatsApp"}</strong>
                            <p>{endpoint.whatsappNumber || "Sem número"}</p>
                          </div>
                          <div className={styles.modulePills}>
                            <span className="badge">{endpoint.moduleKey || "global"}</span>
                            <span className={badgeClass(String(endpoint.whatsappStatus || "").toUpperCase() === "CONNECTED" ? "success" : "danger")}>
                              {endpoint.whatsappStatus || "DISCONNECTED"}
                            </span>
                          </div>
                          <button type="button" className={styles.iconOnlyButton} onClick={() => setIntegrationVisibility((current) => ({ ...current, [endpoint.id]: !current[endpoint.id] }))} aria-label="Ver token do endpoint">
                            <EyeIcon />
                          </button>
                          {integrationVisibility[endpoint.id] ? (
                            <div className="msg-info"><div className="text-sm">{endpoint.accessTokenValue || "Sem token neste endpoint"}</div></div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {drawerTab === "audit" ? (
                  <section className={styles.summaryCard}>
                    <div className={styles.panelCardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Timeline</p>
                        <h3>Auditoria</h3>
                      </div>
                    </div>
                    <div className={styles.timeline}>
                      {activeCompany.auditTimeline.map((entry) => (
                        <article key={entry.id} className={styles.timelineItem}>
                          <div className={styles.timelineDot} />
                          <div>
                            <div className={styles.timelineTopline}>
                              <strong>{entry.action}</strong>
                              <span>{formatDateTime(entry.createdAt)}</span>
                            </div>
                            <p>{entry.scope}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </>
          ) : !detailLoading ? (
            <div className={styles.drawerEmpty}>Selecione uma empresa para abrir o detalhe premium.</div>
          ) : null}
        </aside>
      </div>

      <ModalShell open={masterIntegrationsOpen} onClose={() => setMasterIntegrationsOpen(false)} title="Credenciais globais do MASTER" subtitle="Monte uma biblioteca de credenciais e reaproveite por empresa sem sobrescrever tokens existentes.">
        <div className={styles.modalBody}>
          {activeCompany ? (
            <div className={styles.contextBannerActive}>
              <strong>Importar da empresa ativa</strong>
              <span>
                {activeCompany.name} pode transferir os tokens atuais para o MASTER, virar uma nova credencial da biblioteca e já usar essa credencial no lugar.
              </span>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    setConfirmAction({
                      title: "Importar tokens para o MASTER",
                      description: `${activeCompany.name} terá os tokens copiados para a biblioteca do MASTER, a origem será limpa e a empresa passará a usar essa credencial MASTER.`,
                      confirmLabel: "Importar e limpar origem",
                      tone: "primary",
                      run: async () => {
                        setConfirmAction(null);
                        await importActiveCompanyTokensToMaster(true);
                      },
                    })
                  }
                  disabled={busyAction === `import-master-tokens-${activeCompany.id}`}
                >
                  {busyAction === `import-master-tokens-${activeCompany.id}` ? "Importando..." : "Importar da empresa ativa"}
                </button>
              </div>
            </div>
          ) : null}

          <article className={styles.userCard}>
            <div className={styles.panelCardHeader}>
              <div>
                <strong>Pagamentos do MASTER</strong>
                <p>Biblioteca de access tokens do Mercado Pago para checkout e webhooks.</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addMasterMercadoPagoCredential}>
                Novo token
              </button>
            </div>
            <div className={styles.summaryMeta}>
              <p>Status: {masterIntegrationsDraft.mercadoPagoLibrary.some((entry) => entry.accessToken) ? "Configurado" : "Pendente"}</p>
              <p>Uso: cada empresa pode escolher qual credencial MASTER de pagamentos vai herdar.</p>
            </div>
            <div className={styles.userList}>
              {masterIntegrationsDraft.mercadoPagoLibrary.map((credential) => (
                <article key={credential.key} className={styles.userCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <strong>{credential.label || "Credencial de pagamentos"}</strong>
                      <p>{credential.sourceCompanyName ? `Origem: ${credential.sourceCompanyName}` : "Origem: MASTER"}</p>
                    </div>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.iconOnlyButton} onClick={() => setIntegrationVisibility((current) => ({ ...current, [credential.key]: !current[credential.key] }))} aria-label="Ver token master de pagamentos">
                        <EyeIcon />
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeMasterMercadoPagoCredential(credential.key)}>
                        Remover
                      </button>
                    </div>
                  </div>
                  <input className="field" placeholder="Nome da credencial" value={credential.label || ""} onChange={(event) => updateMasterMercadoPagoCredential(credential.key, { label: event.target.value })} />
                  <input className="field" placeholder="Access token do Mercado Pago" value={integrationVisibility[credential.key] ? credential.accessToken || "" : credential.accessTokenPreview || ""} onChange={(event) => updateMasterMercadoPagoCredential(credential.key, { accessToken: event.target.value })} />
                  <div className={styles.summaryMeta}>
                    <p>{credential.sourceCompanyName ? `Empresa herdada: ${credential.sourceCompanyName}` : "Credencial criada direto no MASTER"}</p>
                    <p>{credential.accessToken ? "Pronta para uso" : "Token pendente"}</p>
                  </div>
                </article>
              ))}
            </div>
          </article>

          <article className={styles.userCard}>
            <div className={styles.panelCardHeader}>
              <div>
                <strong>WhatsApp do MASTER</strong>
                <p>Biblioteca de números e tokens para onboarding e operação guiada das empresas.</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addMasterWhatsAppCredential}>
                Novo WhatsApp
              </button>
            </div>
            <div className={styles.summaryMeta}>
              <p>Status: {masterIntegrationsDraft.whatsappLibrary.some((entry) => entry.accessToken && entry.phoneNumberId) ? "Configurado" : "Pendente"}</p>
              <p>Uso: cada empresa pode escolher qual credencial MASTER de WhatsApp vai herdar.</p>
            </div>
            <div className={styles.userList}>
              {masterIntegrationsDraft.whatsappLibrary.map((credential) => (
                <article key={credential.key} className={styles.userCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <strong>{credential.label || "Credencial de WhatsApp"}</strong>
                      <p>{credential.sourceCompanyName ? `Origem: ${credential.sourceCompanyName}` : "Origem: MASTER"}</p>
                    </div>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.iconOnlyButton} onClick={() => setIntegrationVisibility((current) => ({ ...current, [credential.key]: !current[credential.key] }))} aria-label="Ver token master de WhatsApp">
                        <EyeIcon />
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeMasterWhatsAppCredential(credential.key)}>
                        Remover
                      </button>
                    </div>
                  </div>
                  <div className={styles.formGrid}>
                    <input className="field" placeholder="Nome da credencial" value={credential.label || ""} onChange={(event) => updateMasterWhatsAppCredential(credential.key, { label: event.target.value })} />
                    <input className="field" placeholder="Access token do WhatsApp" value={integrationVisibility[credential.key] ? credential.accessToken || "" : credential.accessTokenPreview || ""} onChange={(event) => updateMasterWhatsAppCredential(credential.key, { accessToken: event.target.value })} />
                    <input className="field" placeholder="Phone Number ID" value={credential.phoneNumberId || ""} onChange={(event) => updateMasterWhatsAppCredential(credential.key, { phoneNumberId: event.target.value })} />
                    <input className="field" placeholder="WABA ID" value={credential.wabaId || ""} onChange={(event) => updateMasterWhatsAppCredential(credential.key, { wabaId: event.target.value })} />
                    <input className="field" placeholder="Número WhatsApp" value={credential.whatsappNumber || ""} onChange={(event) => updateMasterWhatsAppCredential(credential.key, { whatsappNumber: event.target.value })} />
                    <input className="field" placeholder="Número exibido" value={credential.displayNumber || ""} onChange={(event) => updateMasterWhatsAppCredential(credential.key, { displayNumber: event.target.value })} />
                  </div>
                  <div className={styles.summaryMeta}>
                    <p>{credential.sourceCompanyName ? `Empresa herdada: ${credential.sourceCompanyName}` : "Credencial criada direto no MASTER"}</p>
                    <p>{credential.accessToken && credential.phoneNumberId ? "Pronta para uso" : "Dados incompletos"}</p>
                  </div>
                </article>
              ))}
            </div>
          </article>

          <div className={styles.modalActions}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMasterIntegrationsOpen(false)}>
              Fechar
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={saveMasterIntegrations} disabled={busyAction === "master-integrations-save"}>
              {busyAction === "master-integrations-save" ? "Salvando..." : "Salvar biblioteca MASTER"}
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={moduleCatalogOpen} onClose={() => setModuleCatalogOpen(false)} title="Módulos comercializáveis" subtitle="Defina aqui apenas os módulos que podem ser liberados para empresas e entram na cobrança mensal." wide>
        <div className={styles.modalBody}>
          <div className={styles.contextBannerStrong}>
            <strong>Catálogo financeiro do HBX</strong>
            <span>Itens internos do MASTER e ferramentas operacionais não aparecem aqui nem entram na mensalidade das empresas.</span>
          </div>
          <div className={styles.moduleCatalogGrid}>
            {commercialModuleDrafts.map((moduleItem) => (
              <article key={moduleItem.key} className={styles.userCard}>
                <div>
                  <strong>{moduleItem.name}</strong>
                  <p>{moduleItem.key}</p>
                </div>
                <input className="field" placeholder="Nome do módulo" value={moduleItem.name} onChange={(event) => setModuleCatalogDrafts((current) => ({ ...current, [moduleItem.key]: { ...current[moduleItem.key], name: event.target.value } }))} />
                <input className="field" inputMode="numeric" placeholder="R$ 0,00" value={moduleItem.monthlyPrice} onChange={(event) => setModuleCatalogDrafts((current) => ({ ...current, [moduleItem.key]: { ...current[moduleItem.key], monthlyPrice: normalizeCurrencyInput(event.target.value) } }))} />
                <textarea className="field" placeholder="Descrição" rows={3} value={moduleItem.description} onChange={(event) => setModuleCatalogDrafts((current) => ({ ...current, [moduleItem.key]: { ...current[moduleItem.key], description: event.target.value } }))} />
                <select className="field" value={moduleItem.defaultEnabled ? "enabled" : "disabled"} onChange={(event) => setModuleCatalogDrafts((current) => ({ ...current, [moduleItem.key]: { ...current[moduleItem.key], defaultEnabled: event.target.value === "enabled" } }))}>
                  <option value="enabled">Ativo por padrão</option>
                  <option value="disabled">Desativado por padrão</option>
                </select>
                <div className={styles.summaryMeta}>
                  <p>Liberável para empresas</p>
                  <p>{moduleItem.defaultEnabled ? "Novas empresas recebem este módulo ativo" : "Novas empresas começam com este módulo desativado"}</p>
                </div>
                <div className={styles.modalActions}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => saveSystemModule(moduleItem.key)} disabled={busyAction === `system-module-${moduleItem.key}`}>
                    {busyAction === `system-module-${moduleItem.key}` ? "Salvando..." : "Salvar catálogo"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </ModalShell>

      <ModalShell open={createCompanyOpen} onClose={() => setCreateCompanyOpen(false)} title="Nova empresa" subtitle="Crie a empresa e depois configure cobrança, website e módulos.">
        <div className={styles.modalBody}>
          <input className="field" placeholder="Nome da empresa" value={createCompanyName} onChange={(event) => setCreateCompanyName(event.target.value)} />
          <input className="field" placeholder="Slug opcional" value={createCompanySlug} onChange={(event) => setCreateCompanySlug(event.target.value)} />
          <div className={styles.modalActions}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreateCompanyOpen(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={submitCreateCompany} disabled={busyAction === "create-company"}>
              {busyAction === "create-company" ? "Criando..." : "Criar empresa"}
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={Boolean(userModal)} onClose={() => setUserModal(null)} title={userModal?.mode === "create" ? "Criar usuário" : userModal?.mode === "edit" ? "Editar usuário" : "Resetar senha"} subtitle={userModal ? `Empresa: ${userModal.companyName}` : ""}>
        {userModal ? (
          <div className={styles.modalBody}>
            <div className={styles.contextBannerStrong}>
              <strong>Empresa ativa para esta operação</strong>
              <span>{userModal.companyName}</span>
            </div>
            {userModal.mode !== "reset" ? (
              <>
                <input className="field" placeholder="E-mail" value={userModal.email} onChange={(event) => setUserModal((current) => current ? { ...current, email: event.target.value } : current)} />
                <input className="field" placeholder="Nome / username" value={userModal.username} onChange={(event) => setUserModal((current) => current ? { ...current, username: event.target.value } : current)} />
                <select className="field" value={userModal.role} onChange={(event) => setUserModal((current) => current ? { ...current, role: event.target.value as "USER" | "ADMIN" | "GERENTE" } : current)}>
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="GERENTE">GERENTE</option>
                </select>
              </>
            ) : null}
            <input className="field" type="password" placeholder={userModal.mode === "reset" ? "Nova senha opcional" : "Senha opcional"} value={userModal.password} onChange={(event) => setUserModal((current) => current ? { ...current, password: event.target.value } : current)} />
            <div className={styles.modalActions}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setUserModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={submitUserModal} disabled={busyAction === `user-${userModal.mode}`}>
                {busyAction === `user-${userModal.mode}` ? "Salvando..." : userModal.mode === "create" ? "Criar usuário" : userModal.mode === "edit" ? "Salvar alterações" : "Resetar senha"}
              </button>
            </div>
          </div>
        ) : null}
      </ModalShell>

      <ModalShell open={Boolean(manualPaymentModal)} onClose={() => setManualPaymentModal(null)} title="Lançar pagamento manual" subtitle={manualPaymentModal ? `Registrar cobrança manual para ${manualPaymentModal.companyName}.` : ""}>
        {manualPaymentModal ? (
          <div className={styles.modalBody}>
            <div className={styles.formGrid}>
              <input className="field" placeholder="Valor" value={manualPaymentModal.value} onChange={(event) => setManualPaymentModal((current) => current ? { ...current, value: event.target.value } : current)} />
              <input className="field" placeholder="Competência AAAA-MM" value={manualPaymentModal.competence} onChange={(event) => setManualPaymentModal((current) => current ? { ...current, competence: event.target.value } : current)} />
              <input className="field" type="datetime-local" value={manualPaymentModal.paidAt} onChange={(event) => setManualPaymentModal((current) => current ? { ...current, paidAt: event.target.value } : current)} />
              <input className="field" type="date" value={manualPaymentModal.dueDate} onChange={(event) => setManualPaymentModal((current) => current ? { ...current, dueDate: event.target.value } : current)} />
              <select className="field" value={manualPaymentModal.paymentMethod} onChange={(event) => setManualPaymentModal((current) => current ? { ...current, paymentMethod: event.target.value } : current)}>
                <option value="PIX">PIX</option>
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="MANUAL">Outro manual</option>
              </select>
              <input className="field" placeholder="Observação" value={manualPaymentModal.observation} onChange={(event) => setManualPaymentModal((current) => current ? { ...current, observation: event.target.value } : current)} />
            </div>
            <label className={styles.checkboxCard}>
              <input type="checkbox" checked={manualPaymentModal.settlePending} onChange={(event) => setManualPaymentModal((current) => current ? { ...current, settlePending: event.target.checked } : current)} />
              Quitar a pendência atual
            </label>
            <label className={styles.checkboxCard}>
              <input type="checkbox" checked={manualPaymentModal.generateAudit} onChange={(event) => setManualPaymentModal((current) => current ? { ...current, generateAudit: event.target.checked } : current)} />
              Registrar histórico e auditoria
            </label>
            <div className={styles.modalActions}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setManualPaymentModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={submitManualPayment} disabled={busyAction === "manual-payment"}>
                {busyAction === "manual-payment" ? "Lançando..." : "Confirmar pagamento"}
              </button>
            </div>
          </div>
        ) : null}
      </ModalShell>

      <ModalShell open={Boolean(confirmAction)} onClose={() => setConfirmAction(null)} title={confirmAction?.title || "Confirmar operação"} subtitle={confirmAction?.description || ""}>
        {confirmAction ? (
          <div className={styles.modalBody}>
            <div className={styles.modalActions}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmAction(null)}>Cancelar</button>
              <button type="button" className={confirmAction.tone === "danger" ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"} onClick={() => void confirmAction.run()}>
                {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        ) : null}
      </ModalShell>
    </DashboardScaffold>
  );
}
