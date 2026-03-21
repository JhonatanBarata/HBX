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
  };
  modules: Array<{
    key: string;
    name: string;
    enabled: boolean;
  }>;
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
      endpoints: Array<{
        id: string;
        label?: string | null;
        moduleKey?: string | null;
        whatsappNumber?: string | null;
        whatsappDisplayNumber?: string | null;
        whatsappStatus?: string | null;
        whatsappStatusError?: string | null;
        accessTokenConfigured: boolean;
        isActive: boolean;
        isPrimary: boolean;
      }>;
    };
    mercadoPago: CompanySummary["mercadoPago"] & {
      statusError?: string | null;
      lastValidatedAt?: string | null;
    };
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
  | "billing"
  | "payments"
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
  { id: "billing", label: "Cobrança" },
  { id: "payments", label: "Pagamentos" },
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

function ModalShell({
  title,
  subtitle,
  open,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className={styles.modalRoot}>
      <button type="button" className={styles.modalBackdrop} onClick={onClose} aria-label="Fechar modal" />
      <article className={styles.modalCard}>
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
  const [createCompanyName, setCreateCompanyName] = useState("");
  const [createCompanySlug, setCreateCompanySlug] = useState("");
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const [websiteDraft, setWebsiteDraft] = useState<WebsiteDraft | null>(null);
  const [mercadoPagoDraft, setMercadoPagoDraft] = useState<MercadoPagoDraft | null>(null);
  const [trialDateDraft, setTrialDateDraft] = useState("");
  const [userModal, setUserModal] = useState<UserModalState | null>(null);
  const [manualPaymentModal, setManualPaymentModal] = useState<ManualPaymentState | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);
  const deferredSearch = useDeferredValue(search);

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
                            onClick={() => openCompany(company.id, company.statusBucket === "OVERDUE" ? "payments" : "summary")}
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
                <section className={styles.summaryCard}>
                  <div className={styles.summaryStats}>
                    <div><span>Mensalidade</span><strong>{formatCurrency(activeCompany.monthlyValue)}</strong></div>
                    <div><span>Próxima cobrança</span><strong>{formatDate(activeCompany.nextDueAt)}</strong></div>
                    <div><span>Último pagamento</span><strong>{activeCompany.lastPayment ? formatDate(activeCompany.lastPayment.paidAt) : "Sem histórico"}</strong></div>
                    <div><span>Dias em atraso</span><strong>{activeCompany.daysOverdue}</strong></div>
                  </div>
                  <div className={styles.drawerQuickActions}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => openManualPayment(activeCompany)}>Lançar pagamento manual</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => runTrialAction(activeCompany.id, { action: "extend", days: 7 }, "Trial prorrogado em 7 dias.")}>+7 dias</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => runTrialAction(activeCompany.id, { action: "extend", days: 15 }, "Trial prorrogado em 15 dias.")}>+15 dias</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => runTrialAction(activeCompany.id, { action: "extend", days: 30 }, "Trial prorrogado em 30 dias.")}>+30 dias</button>
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

                {drawerTab === "summary" ? (
                  <section className={styles.summaryCard}>
                    <div className={styles.panelCardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Resumo operacional</p>
                        <h3>Contexto completo da empresa ativa</h3>
                      </div>
                      <div className={styles.rowActions}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openCompany(activeCompany.id, "payments")}>
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

                {drawerTab === "billing" ? (
                  <section className={styles.summaryCard}>
                    <div className={styles.panelCardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Cadastro financeiro</p>
                        <h3>Perfil SaaS e cobrança</h3>
                      </div>
                      <button type="button" className="btn btn-primary btn-sm" onClick={saveProfile}>
                        Salvar perfil
                      </button>
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
                        Premium access liberado
                      </label>
                    </div>
                  </section>
                ) : null}

                {drawerTab === "payments" ? (
                  <section className={styles.summaryCard}>
                    <div className={styles.panelCardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Financeiro</p>
                        <h3>Histórico financeiro</h3>
                      </div>
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
                    </div>
                    <div className={styles.moduleList}>
                      {activeCompany.modules.map((module) => (
                        <label key={module.key} className={styles.moduleToggle}>
                          <div>
                            <strong>{module.name}</strong>
                            <p>{module.key}</p>
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
                        <h3>Mercado Pago e WhatsApp</h3>
                      </div>
                    </div>
                    <div className={styles.summaryMeta}>
                      <p>Mercado Pago: {mercadoPagoDraft?.status || activeCompany.mercadoPago.status || "Sem status"}</p>
                      <p>Conta MP: {mercadoPagoDraft?.accountEmail || activeCompany.mercadoPago.accountEmail || "-"}</p>
                      <p>WhatsApps configurados: {activeCompany.whatsapp.endpoints.length}</p>
                    </div>
                    <input className="field" placeholder="Cole o access token do Mercado Pago" value={mercadoPagoDraft?.mercadoPagoAccessToken || ""} onChange={(event) => setMercadoPagoDraft((current) => current ? { ...current, mercadoPagoAccessToken: event.target.value } : current)} />
                    {mercadoPagoDraft?.statusError ? <div className="alert alert-error">{mercadoPagoDraft.statusError}</div> : null}
                    <div className={styles.rowActions}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={validateMercadoPagoConfig}>Validar token</button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={saveMercadoPagoConfig}>Salvar token</button>
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
