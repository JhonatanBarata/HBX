"use client";

import Link from "next/link";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import { dispatchModulesChanged } from "@/lib/module-events";
import { dispatchMasterContextChanged } from "@/lib/masterContextEvents";
import { EyeIcon, ModalShell } from "./_components/MasterPremiumChrome";
import { DistributionCard, MetricCard, PaymentChart, RevenueChart } from "./_components/MasterPremiumCharts";
import { useMasterFocusLock } from "./_hooks/useMasterFocusLock";
import { fetchMasterWorkspaceBootstrap } from "./master.bootstrap";
import { formatCurrency } from "./master.formatters";
import type {
  AuditEntry,
  CompanyDetailPayload,
  CompanyIntegrationConnection,
  CompanySummary,
  ConfirmActionState,
  CurrentUser,
  DrawerTab,
  FinanceSettingsDraft,
  IntegrationEditorState,
  IntegrationProviderId,
  ManualPaymentState,
  MasterIntegrationsDraft,
  MasterMercadoPagoCredential,
  MasterWhatsAppCredential,
  MasterWhatsAppSituationMode,
  MercadoPagoDraft,
  ModuleCatalogDraft,
  OperationalStatusChip,
  OperationalTone,
  ProfileDraft,
  StatusBucket,
  UserModalState,
  WebsiteDraft,
  WhatsAppMigrationWorkflowDraft,
  WorkspacePayload,
} from "./master.types";
import styles from "./page.module.css";

function buildHardDeleteConfirmation(companyName: string) {
  const normalized = companyName.trim();
  return normalized ? `EXCLUIR ${normalized}` : "EXCLUIR EMPRESA";
}

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "operational_error", label: "Com erro" },
  { id: "operational_attention", label: "Em atenção" },
  { id: "operational_no_payment", label: "Sem pagamento" },
  { id: "operational_no_access", label: "Sem acesso" },
  { id: "trial_ending", label: "Trial acabando" },
  { id: "whatsapp_migration_pending", label: "WhatsApp pendente" },
  { id: "payment_attention", label: "Pagamento em atenção" },
  { id: "high_scraping", label: "Scraping forte" },
  { id: "low_activation", label: "Ativação fraca" },
  { id: "PAYING", label: "Pagando" },
  { id: "MANUAL_PREMIUM", label: "Premium manual" },
  { id: "TRIAL", label: "Trial" },
  { id: "TRIAL_ENDING", label: "Trial vencendo" },
  { id: "OVERDUE", label: "Inadimplentes" },
  { id: "NO_METHOD", label: "Sem método" },
  { id: "manual", label: "Pagamento manual" },
  { id: "SUSPENDED", label: "Suspensos" },
] as const;

const TABS: Array<{ id: DrawerTab; label: string }> = [
  { id: "summary", label: "Resumo" },
  { id: "finance", label: "Cobrança" },
  { id: "users", label: "Usuários" },
  { id: "modules", label: "Módulos" },
  { id: "website", label: "Website" },
  { id: "integrations", label: "Integrações" },
  { id: "audit", label: "Auditoria" },
  { id: "danger", label: "Perigo" },
];

const COMMERCIAL_PLAN_OPTIONS = [
  { key: "hbx_lite", label: "HBX List", price: "R$ 49,90/mês" },
  { key: "hbx_padrao", label: "HBX Lead", price: "R$ 89,90/mês" },
  { key: "hbx_melhor", label: "HBX Full — Bot e IA", price: "R$ 149,90/mês" },
] as const;

function commercialPlanLabel(value?: string | null) {
  return COMMERCIAL_PLAN_OPTIONS.find((item) => item.key === value)?.label || "Sem plano comercial";
}

function normalizeDrawerTab(value?: string | null): DrawerTab {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "finance") return "finance";
  if (normalized === "whatsapp") return "integrations";
  if (normalized === "users") return "users";
  if (normalized === "modules") return "modules";
  if (normalized === "website") return "website";
  if (normalized === "integrations") return "integrations";
  if (normalized === "audit") return "audit";
  if (normalized === "danger") return "danger";
  return "summary";
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
  if (status === "manual") return "Premium manual";
  if (status === "past_due") return "Em atraso";
  if (status === "canceled") return "Cancelada";
  if (status === "expired") return "Expirada";
  return status || "-";
}

function paymentStatusLabel(value?: string | null) {
  const status = String(value || "").trim().toUpperCase();
  if (status === "PAID") return "Pago";
  if (status === "TRIAL") return "Trial";
  if (status === "MANUAL") return "Premium manual";
  if (status === "PENDING") return "Pendente";
  if (status === "OVERDUE") return "Atrasado";
  if (status === "EXPIRED") return "Expirado";
  if (status === "DISABLED") return "Suspenso";
  return status || "-";
}

function acquisitionSourceLabel(value?: string | null) {
  const source = String(value || "").trim().toLowerCase();
  if (source === "google") return "Google";
  if (source === "instagram") return "Instagram";
  if (source === "youtube") return "YouTube";
  if (source === "indicacao") return "Indicação";
  if (source === "parceiro") return "Parceiro";
  if (source === "outro") return "Outro";
  return "Não informado";
}

function onboardingStatusLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pending_email_confirmation") return "E-mail pendente";
  if (normalized === "active_trial") return "Trial ativo";
  if (normalized === "active_paid") return "Ativo pago";
  if (normalized === "suspended") return "Suspenso";
  return "Sem leitura";
}

function trialModuleLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "recovery") return "Recovery";
  if (normalized === "vendas") return "Vendas";
  return "Não definido";
}

function activationStatusLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pending_email_confirmation") return "Aguardando confirmação";
  if (normalized === "needs_activation") return "Ativação fraca";
  if (normalized === "operating") return "Operando";
  if (normalized === "basic_access") return "Acesso básico";
  return "Sem leitura";
}

function webscrapingSourceLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "global_cache") return "Cache global";
  if (normalized === "history") return "Histórico";
  if (normalized === "hybrid") return "Híbrido";
  if (normalized === "google") return "Google";
  return "Sem busca";
}

function referralModeLabel(value?: string | null) {
  return String(value || "").trim().toUpperCase() === "RECURRING" ? "Recorrente" : "Único";
}

function companyHasOperationalAccess(company?: Pick<CompanySummary, "isActive" | "paymentStatus" | "subscriptionStatus"> | null) {
  if (!company?.isActive) return false;
  const paymentStatus = String(company.paymentStatus || "").trim().toUpperCase();
  const subscriptionStatus = String(company.subscriptionStatus || "").trim().toLowerCase();
  return paymentStatus === "PAID" || paymentStatus === "TRIAL" || paymentStatus === "MANUAL" || subscriptionStatus === "active" || subscriptionStatus === "trialing" || subscriptionStatus === "manual";
}

function bucketLabel(value: StatusBucket) {
  if (value === "PAYING") return "Pagando";
  if (value === "MANUAL_PREMIUM") return "Premium manual";
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

function operationalBadgeClass(tone?: OperationalTone | null) {
  if (tone === "green") return "badge badge-success";
  if (tone === "red") return "badge badge-danger";
  if (tone === "yellow") return "badge badge-brand";
  return "badge";
}

function operationalHealthLabel(tone?: OperationalTone | null) {
  if (tone === "green") return "Operando";
  if (tone === "yellow") return "Em atenção";
  if (tone === "red") return "Crítica";
  return "Sem leitura";
}

function operationalAccessSourceLabel(value?: "paid" | "trial" | "blocked" | string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "paid") return "Pagamento ativo";
  if (normalized === "trial") return "Trial ativo";
  if (normalized === "manual") return "Premium manual";
  if (normalized === "blocked") return "Bloqueado";
  return "Sem fonte";
}

function compactOperationalHint(value?: string | null, fallback = "Sem detalhe operacional.") {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  const [firstSentence] = normalized.split(/(?<=[.!?])\s+/);
  const compact = String(firstSentence || normalized).trim();
  if (compact.length <= 96) return compact;
  return `${compact.slice(0, 93).trimEnd()}...`;
}

function whatsappSituationTone(
  situation?: CompanySummary["whatsappSituation"] | null,
  center?: CompanySummary["whatsappCenter"] | null,
) {
  if (situation?.status === "connected") return situation.mode === "qr" ? "brand" : "success";
  if (situation?.status === "error") return "danger";
  if (situation?.status === "attention") return "warning";
  if (center?.status === "OFFICIAL") return "success";
  if (center?.status === "QR") return "brand";
  if (center?.status === "ATTENTION") return "danger";
  return "neutral";
}

function whatsappModeLabel(
  mode?: MasterWhatsAppSituationMode | string | null,
  center?: CompanySummary["whatsappCenter"] | null,
) {
  if (mode === "qr") return "QR rápido = teste/onboarding rápido";
  if (mode === "official") return "Meta oficial = produção";
  if (mode === "master_token") return "Token Master = credencial global controlada pelo Master";
  if (mode === "mixed") return "Misto: QR, Meta e Token Master em paralelo";
  if (mode === "none") return "Sem WhatsApp configurado";
  if (center?.mode === "QR") return "QR rápido = teste/onboarding rápido";
  if (center?.mode === "OFFICIAL") return "Meta oficial = produção";
  return "Sem WhatsApp configurado";
}

function whatsappStatusLabel(company: CompanySummary) {
  return company.whatsappSituation?.statusLabel || company.whatsappCenter?.statusLabel || "Não conectado";
}

function normalizeOperationalHref(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return null;
  const normalized = raw.startsWith("/") ? raw : `/${raw.replace(/^\/+/, "")}`;
  const legacyPrefix = "/" + "dashboard";
  const legacyRoutes: Array<[string, string]> = [
    ["/financeiro", "/pagamento"],
    ["/planos", "/planos"],
    ["/vendas", "/vendas"],
    ["/inbox", "/atendimento"],
    ["/whatsapp", "/whatsapp"],
    ["/website", "/website"],
    ["/webscraping", "/radar-digital"],
    ["/gerencial", "/gerencial"],
    ["/importacoes/followup-global", "/followup-global"],
    ["/master", "/master"],
  ];
  const cleanHref = normalized.startsWith(`${legacyPrefix}/`)
    ? legacyRoutes.reduce((current, [legacy, clean]) => (
        current.startsWith(`${legacyPrefix}${legacy}`)
          ? `${clean}${current.slice(`${legacyPrefix}${legacy}`.length)}`
          : current
      ), normalized)
    : normalized;
  const allowedRoots = [
    "/atendimento",
    "/followup-global",
    "/gerencial",
    "/importacoes",
    "/master",
    "/pagamento",
    "/planos",
    "/vendas",
    "/radar-digital",
    "/website",
    "/whatsapp",
  ];
  return allowedRoots.some((root) => cleanHref === root || cleanHref.startsWith(`${root}/`) || cleanHref.startsWith(`${root}?`))
    ? cleanHref
    : null;
}

function companyOperationalChip(company: CompanySummary, key: OperationalStatusChip["key"]) {
  return company.operationalStatus?.statuses.find((chip) => chip.key === key) || null;
}

function resolveMasterWhatsAppHref(company: CompanySummary) {
  const tokenChip = companyOperationalChip(company, "token");
  const metaChip = companyOperationalChip(company, "meta");
  const webWhatsChip = companyOperationalChip(company, "webwhats");
  const officialNeedsAttention = [tokenChip, metaChip].some((chip) => chip && chip.tone !== "green");
  if (officialNeedsAttention) {
    return tokenChip?.href || metaChip?.href || "/whatsapp?focus=official";
  }
  if (webWhatsChip?.tone === "yellow") {
    return webWhatsChip.href;
  }
  return "/whatsapp?focus=status";
}

function resolveMasterFinanceiroHref(company: CompanySummary) {
  const accessChip = companyOperationalChip(company, "access");
  const paymentChip = companyOperationalChip(company, "payment");
  if (accessChip && accessChip.tone !== "green") {
    return accessChip.href;
  }
  if (paymentChip && paymentChip.tone !== "green") {
    return paymentChip.href;
  }
  return "/pagamento?focus=access";
}

const AUDIT_KEY_LABELS: Record<string, string> = {
  requestedAction: "Ação solicitada",
  reason: "Motivo",
  endsAt: "Fim definido",
  days: "Dias",
  trialStartsAt: "Início trial",
  trialEndsAt: "Fim trial",
  paymentStatus: "Status pagamento",
  subscriptionStatus: "Status assinatura",
  paymentMethod: "Método",
  billingProvider: "Provedor",
  premiumAccess: "Premium manual",
  isActive: "Ativa",
  observation: "Observação",
  competence: "Competência",
  value: "Valor",
  settlePending: "Quitar pendência",
  status: "Status",
  statusError: "Erro",
  connected: "Conectado",
  endpointId: "Endpoint",
  workflowStatus: "Workflow migração",
  lastContactAt: "Último contato",
  internalNote: "Nota interna",
  interestRequested: "Interesse solicitado",
  requestedAt: "Solicitado em",
  source: "Origem",
  centerStatus: "Status central",
  centerMode: "Modo central",
  billingCycle: "Ciclo",
  manualDiscountPercent: "Desconto manual",
  freeMonths: "Meses grátis",
  masterMercadoPagoCredentialKey: "Credencial MP",
  masterWhatsAppCredentialKey: "Credencial WhatsApp",
  useMasterMercadoPagoToken: "Usa token MASTER MP",
  useMasterWhatsAppToken: "Usa token MASTER WhatsApp",
  sourceCredentialsCleared: "Credenciais limpas",
  importedMercadoPago: "Importou MP",
  importedWhatsApp: "Importou WhatsApp",
  accessTokenConfigured: "Token configurado",
  accessTokenPreview: "Preview token",
  whatsappPhoneNumberId: "Phone ID",
  whatsappNumber: "Número",
  whatsappWabaId: "WABA ID",
  accountEmail: "Conta",
  accountUserId: "Usuário MP",
  moduleName: "Módulo",
  moduleKey: "Chave módulo",
  enabled: "Habilitado",
  previousState: "Antes",
  currentState: "Depois",
};

function isAuditRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function auditSeverityTone(severity?: string | null) {
  const normalized = String(severity || "").trim().toUpperCase();
  if (normalized === "ERROR") return "danger";
  if (normalized === "WARN" || normalized === "WARNING") return "brand";
  return "success";
}

function auditKeyLabel(key: string) {
  if (AUDIT_KEY_LABELS[key]) return AUDIT_KEY_LABELS[key];
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (value) => value.toUpperCase());
}

function isAuditDateLike(key: string, value: string) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return /(^|_)(at|date)$/i.test(key) || /T\d{2}:\d{2}:\d{2}/.test(value);
}

function formatAuditValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") {
    if (key.toLowerCase().includes("percent")) return `${value}%`;
    if (key === "value") return formatCurrency(value);
    return String(value);
  }
  if (typeof value === "string") {
    if (isAuditDateLike(key, value)) return formatDateTime(value);
    if (key === "paymentStatus") return paymentStatusLabel(value);
    if (key === "subscriptionStatus") return subscriptionLabel(value);
    if (key === "paymentMethod") return paymentMethodLabel(value);
    if (key === "billingCycle") return String(value).trim().toUpperCase() === "ANNUAL" ? "Anual" : "Mensal";
    return value;
  }
  if (Array.isArray(value)) {
    if (!value.length) return "0 item(ns)";
    if (value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))) {
      const rendered = value.slice(0, 3).map((item) => formatAuditValue(key, item)).join(", ");
      return value.length > 3 ? `${rendered} +${value.length - 3}` : rendered;
    }
    return `${value.length} item(ns)`;
  }
  if (isAuditRecord(value)) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (!entries.length) return "-";
    const preview = entries
      .slice(0, 3)
      .map(([childKey, childValue]) => `${auditKeyLabel(childKey)}: ${formatAuditValue(childKey, childValue)}`)
      .join(" • ");
    return entries.length > 3 ? `${preview} • +${entries.length - 3}` : preview;
  }
  return String(value);
}

function areAuditValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function buildAuditDetailRows(metadata?: Record<string, unknown> | null) {
  if (!metadata) return [] as Array<{ key: string; label: string; value: string }>;
  return Object.entries(metadata)
    .filter(([key]) => key !== "previousState" && key !== "currentState")
    .map(([key, value]) => ({
      key,
      label: auditKeyLabel(key),
      value: formatAuditValue(key, value),
    }))
    .filter((row) => row.value !== "-");
}

function buildAuditChangeRows(metadata?: Record<string, unknown> | null) {
  const previousState = isAuditRecord(metadata?.previousState) ? metadata.previousState : null;
  const currentState = isAuditRecord(metadata?.currentState) ? metadata.currentState : null;
  if (!previousState && !currentState) return [] as Array<{ key: string; label: string; before: string; after: string }>;
  const keys = Array.from(new Set([...Object.keys(previousState || {}), ...Object.keys(currentState || {})]));
  return keys
    .filter((key) => !areAuditValuesEqual(previousState?.[key], currentState?.[key]))
    .map((key) => ({
      key,
      label: auditKeyLabel(key),
      before: formatAuditValue(key, previousState?.[key]),
      after: formatAuditValue(key, currentState?.[key]),
    }));
}

type OperationalNavigationTarget =
  | { kind: "chip"; chip: OperationalStatusChip }
  | { kind: "whatsapp" }
  | { kind: "finance" };

function resolveOperationalNavigationTarget(company: CompanySummary, target: OperationalNavigationTarget) {
  if (target.kind === "chip") {
    const fallbackHref = ["payment", "access"].includes(target.chip.key)
      ? resolveMasterFinanceiroHref(company)
      : resolveMasterWhatsAppHref(company);
    return {
      actionId: `chip-${target.chip.key}`,
      label: target.chip.label,
      href:
        normalizeOperationalHref(target.chip.href) ||
        normalizeOperationalHref(fallbackHref) ||
        "/master",
    };
  }

  if (target.kind === "finance") {
    return {
      actionId: "finance",
      label: "Financeiro",
      href: normalizeOperationalHref(resolveMasterFinanceiroHref(company)) || "/pagamento?focus=access",
    };
  }

  return {
    actionId: "whatsapp",
    label: "WhatsApp",
    href: normalizeOperationalHref(resolveMasterWhatsAppHref(company)) || "/whatsapp?focus=status",
  };
}

function operationalHrefRequiresContext(href: string) {
  return href.startsWith("/") && !href.startsWith("/master");
}

function integrationStatusTone(status?: string | null) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "CONNECTED" || normalized === "SUCCESS") return "success";
  if (normalized === "ERROR" || normalized === "FAILED") return "danger";
  if (normalized === "DISCONNECTED" || normalized === "PARTIAL") return "warning";
  return "neutral";
}

function buildIntegrationEditor(connection?: CompanyIntegrationConnection | null): IntegrationEditorState {
  return {
    mode: connection ? "edit" : "create",
    connectionId: connection?.id,
    provider: connection?.provider || "AUVO",
    instanceName: connection?.instanceName || "",
    secret: "",
    appKey: "",
    baseUrl: connection?.connectionConfig?.baseUrl || "",
    authMode: connection?.connectionConfig?.authMode || "",
    externalAccountId: connection?.connectionConfig?.externalAccountId || "",
    isActive: connection?.isActive ?? true,
  };
}

const INTEGRATION_PROVIDER_OPTIONS: Array<{
  id: IntegrationProviderId;
  label: string;
  secretLabel: string;
}> = [
  { id: "AUVO", label: "AUVO", secretLabel: "Token AUVO" },
  { id: "TAGPLUS", label: "TagPlus", secretLabel: "Token TagPlus" },
];

function statusTone(bucket: StatusBucket) {
  if (bucket === "PAYING") return "success";
  if (bucket === "MANUAL_PREMIUM" || bucket === "TRIAL" || bucket === "TRIAL_ENDING") return "warning";
  if (bucket === "OVERDUE" || bucket === "SUSPENDED" || bucket === "NO_METHOD") return "danger";
  return "neutral";
}

function formatDayCount(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  const amount = Math.abs(Math.trunc(value));
  return `${amount} ${amount === 1 ? "dia" : "dias"}`;
}

function buildOperationalRule(company: CompanySummary) {
  const subscriptionStatus = String(company.subscriptionStatus || "").trim().toLowerCase();
  const paymentStatus = String(company.paymentStatus || "").trim().toUpperCase();
  const accessLimit =
    paymentStatus === "PAID" || subscriptionStatus === "active"
      ? company.subscriptionCurrentPeriodEnd || company.nextDueAt
      : paymentStatus === "MANUAL" || subscriptionStatus === "manual"
        ? null
      : paymentStatus === "TRIAL" || subscriptionStatus === "trialing"
        ? company.trialEndsAt
        : company.nextDueAt || company.subscriptionCurrentPeriodEnd || company.trialEndsAt;

  if (!company.isActive) {
    if (paymentStatus === "DISABLED") {
      return "Empresa arquivada ou suspensa. O acesso operacional permanece bloqueado até nova ação administrativa.";
    }
    if (company.daysOverdue > 0 && accessLimit) {
      return `Acesso bloqueado. O vencimento passou em ${formatDayCount(company.daysOverdue)} desde ${formatDate(accessLimit)}.`;
    }
    if (accessLimit) {
      return `Acesso bloqueado. A última janela operacional válida foi até ${formatDate(accessLimit)}.`;
    }
    return "Acesso bloqueado até nova ação administrativa.";
  }

  if (paymentStatus === "TRIAL" || subscriptionStatus === "trialing") {
    if (company.trialRemainingDays != null && company.trialRemainingDays >= 0) {
      return `Se não pagar, perde acesso em ${formatDayCount(company.trialRemainingDays)}.`;
    }
    if (company.trialEndsAt) {
      return `Trial em curso até ${formatDate(company.trialEndsAt)}.`;
    }
    return "Trial ativo sem data final definida.";
  }

  if (paymentStatus === "PAID" || subscriptionStatus === "active") {
    if (accessLimit) {
      return `Acesso liberado até ${formatDate(accessLimit)}.`;
    }
    return "Acesso liberado enquanto a cobrança permanecer regular.";
  }

  if (paymentStatus === "MANUAL" || subscriptionStatus === "manual") {
    return "Acesso premium liberado manualmente pelo MASTER, sem geração automática de cobrança.";
  }

  if (company.daysOverdue > 0) {
    if (accessLimit) {
      return `Se não regularizar, o acesso fica comprometido desde ${formatDate(accessLimit)}.`;
    }
    return `Empresa em atraso há ${formatDayCount(company.daysOverdue)}.`;
  }

  if (accessLimit) {
    return `Se não pagar, perde acesso em ${formatDate(accessLimit)}.`;
  }

  return "Status operacional depende da próxima ação financeira.";
}

function buildStatusExplanation(company: CompanySummary) {
  if (company.paymentStatus === "PAID") {
    return "Cobrança operacional marcada como paga. Isso não significa, por si só, que existe ledger financeiro lançado.";
  }
  if (company.paymentStatus === "MANUAL") {
    return "Acesso premium excepcional liberado manualmente. Não representa pagamento real e não gera ledger automático.";
  }
  if (company.paymentStatus === "TRIAL") {
    return "Cliente em trial. Sem lançamento financeiro automático até que você registre cobrança manual ou adote outra régua.";
  }
  if (company.paymentStatus === "OVERDUE" || company.paymentStatus === "PENDING") {
    return "Cliente com cobrança pendente. O ledger real só existe quando um lançamento manual é registrado.";
  }
  if (company.paymentStatus === "DISABLED" || company.paymentStatus === "EXPIRED") {
    return "Acesso bloqueado por regra operacional. Esse estado não cria cobrança automática nem lança financeiro.";
  }
  return company.financialSituation || "Sem leitura financeira consolidada.";
}

function isArchivedOrSuspended(company: CompanySummary) {
  return !company.isActive && String(company.paymentStatus || "").trim().toUpperCase() === "DISABLED";
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
      monthlyPrice: "0",
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
    annualPlanDiscountPercent: Number(workspace?.masterIntegrations?.annualPlanDiscountPercent || 0) || 0,
    extraSeatMonthlyAmount: Number(workspace?.masterIntegrations?.extraSeatMonthlyAmount || 0) || 0,
    referralDiscountActive: Boolean(workspace?.masterIntegrations?.referralDiscountActive),
    referralDiscountPercent: Number(workspace?.masterIntegrations?.referralDiscountPercent || 0) || 0,
    referralDiscountMode:
      String(workspace?.masterIntegrations?.referralDiscountMode || "").trim().toUpperCase() === "RECURRING"
        ? "RECURRING"
        : "ONCE",
    mercadoPagoLibrary: [...(workspace?.masterIntegrations?.mercadoPagoLibrary || [])],
    whatsappLibrary: [...(workspace?.masterIntegrations?.whatsappLibrary || [])],
  };
}

function buildFinanceSettingsDraft(company: CompanyDetailPayload["company"]): FinanceSettingsDraft {
  return {
    billingCycle: company.finance?.billingCycle === "ANNUAL" ? "ANNUAL" : "MONTHLY",
    manualDiscountPercent: String(company.finance?.manualDiscountPercent ?? 0),
    freeMonths: String(company.finance?.freeMonths ?? 0),
  };
}

function buildWhatsAppMigrationWorkflowDraft(
  company: CompanyDetailPayload["company"],
): WhatsAppMigrationWorkflowDraft {
  const workflowStatus = String(company.whatsappCenter?.migration?.workflowStatus || "").trim().toUpperCase();
  return {
    status:
      workflowStatus === "CONTACTED" || workflowStatus === "RESOLVED"
        ? (workflowStatus as "CONTACTED" | "RESOLVED")
        : "REQUESTED",
    internalNote: company.whatsappCenter?.migration?.internalNote || "",
    lastContactAt: company.whatsappCenter?.migration?.lastContactAt
      ? toDatetimeLocalValue(company.whatsappCenter.migration.lastContactAt)
      : "",
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

export default function MasterPremiumPage() {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [operationalBusyAction, setOperationalBusyAction] = useState<string | null>(null);
  const [createCompanyOpen, setCreateCompanyOpen] = useState(false);
  const [masterIntegrationsOpen, setMasterIntegrationsOpen] = useState(false);
  const [moduleCatalogOpen, setModuleCatalogOpen] = useState(false);
  const [createCompanyName, setCreateCompanyName] = useState("");
  const [createCompanySlug, setCreateCompanySlug] = useState("");
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const [websiteDraft, setWebsiteDraft] = useState<WebsiteDraft | null>(null);
  const [mercadoPagoDraft, setMercadoPagoDraft] = useState<MercadoPagoDraft | null>(null);
  const [financeSettingsDraft, setFinanceSettingsDraft] = useState<FinanceSettingsDraft | null>(null);
  const [whatsAppMigrationWorkflowDraft, setWhatsAppMigrationWorkflowDraft] = useState<WhatsAppMigrationWorkflowDraft | null>(null);
  const [trialDateDraft, setTrialDateDraft] = useState("");
  const [trialDaysDraft, setTrialDaysDraft] = useState("7");
  const [moduleCatalogDrafts, setModuleCatalogDrafts] = useState<Record<string, ModuleCatalogDraft>>({});
  const [masterIntegrationsDraft, setMasterIntegrationsDraft] = useState<MasterIntegrationsDraft>({
    mercadoPagoConfigured: false,
    whatsappConfigured: false,
    annualPlanDiscountPercent: 0,
    extraSeatMonthlyAmount: 0,
    referralDiscountActive: false,
    referralDiscountPercent: 0,
    referralDiscountMode: "ONCE",
    mercadoPagoLibrary: [],
    whatsappLibrary: [],
  });
  const [companyIntegrations, setCompanyIntegrations] = useState<CompanyIntegrationConnection[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationsLoadedCompanyId, setIntegrationsLoadedCompanyId] = useState<number | null>(null);
  const [integrationEditor, setIntegrationEditor] = useState<IntegrationEditorState | null>(null);
  const [integrationVisibility, setIntegrationVisibility] = useState<Record<string, boolean>>({});
  const [userModal, setUserModal] = useState<UserModalState | null>(null);
  const [manualPaymentModal, setManualPaymentModal] = useState<ManualPaymentState | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);
  const [confirmActionInput, setConfirmActionInput] = useState("");
  const operationalActionLockRef = useRef<string | null>(null);
  const operationalReleaseTimeoutRef = useRef<number | null>(null);
  const deepLinkOpenRef = useRef<string | null>(null);
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
      const { workspacePayload, userPayload } = await fetchMasterWorkspaceBootstrap(!background);
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
      setFinanceSettingsDraft(buildFinanceSettingsDraft(payload.company));
      setWhatsAppMigrationWorkflowDraft(buildWhatsAppMigrationWorkflowDraft(payload.company));
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

  async function loadCompanyIntegrations(companyId: number) {
    setIntegrationsLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<CompanyIntegrationConnection[]>(`/modules/master/company/${companyId}/integrations`);
      setCompanyIntegrations(payload);
      setIntegrationsLoadedCompanyId(companyId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar integrações da empresa.");
    } finally {
      setIntegrationsLoading(false);
    }
  }

  useEffect(() => {
    if (hasToken !== true) return;
    loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  useEffect(() => {
    if (hasToken !== true || loading) return;
    const companyIdRaw = searchParams.get("companyId") || searchParams.get("cliente");
    const companyId = Number(companyIdRaw || 0);
    if (!Number.isFinite(companyId) || companyId <= 0) return;
    const preferredTab = normalizeDrawerTab(searchParams.get("tab"));
    const deepLinkKey = `${companyId}:${preferredTab}`;
    if (deepLinkOpenRef.current === deepLinkKey) return;
    deepLinkOpenRef.current = deepLinkKey;
    openCompany(companyId, preferredTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken, loading, searchParams]);

  useEffect(() => {
    setIntegrationEditor(null);
    setCompanyIntegrations([]);
    setIntegrationsLoadedCompanyId(null);
  }, [detail?.company?.id]);

  useEffect(() => {
    if (!drawerOpen || drawerTab !== "integrations") return;
    const companyId = detail?.company?.id;
    if (!companyId) return;
    if (integrationsLoadedCompanyId === companyId) return;
    void loadCompanyIntegrations(companyId);
  }, [drawerOpen, drawerTab, detail?.company?.id, integrationsLoadedCompanyId]);

  useEffect(() => {
    if (confirmAction) {
      setConfirmActionInput("");
    }
  }, [confirmAction]);

  useEffect(() => {
    return () => {
      if (operationalReleaseTimeoutRef.current != null && typeof window !== "undefined") {
        window.clearTimeout(operationalReleaseTimeoutRef.current);
      }
    };
  }, []);

  useMasterFocusLock({
    drawerOpen,
    createCompanyOpen,
    masterIntegrationsOpen,
    moduleCatalogOpen,
    userModalOpen: Boolean(userModal),
    manualPaymentModalOpen: Boolean(manualPaymentModal),
    confirmActionOpen: Boolean(confirmAction),
  });

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
        if (filterId === "operational_error") {
          return company.operationalStatus?.overallHealth === "red";
        }
        if (filterId === "operational_attention") {
          return company.operationalStatus?.overallHealth === "yellow";
        }
        if (filterId === "operational_no_payment") {
          return !company.operationalStatus?.paymentActive;
        }
        if (filterId === "operational_no_access") {
          return !company.operationalStatus?.accessActive;
        }
        if (filterId === "manual") return Boolean(company.manualPaymentPending);
        if (filterId === "trial_ending") {
          return company.statusBucket === "TRIAL_ENDING" || ((company.trialRemainingDays || 99) >= 0 && (company.trialRemainingDays || 99) <= 3);
        }
        if (filterId === "whatsapp_migration_pending") {
          return ["REQUESTED", "CONTACTED"].includes(
            String(company.whatsappCenter?.migration?.workflowStatus || "").trim().toUpperCase(),
          );
        }
        if (filterId === "payment_attention") {
          return company.finance.pendingCount > 0 || company.finance.failedCount > 0 || company.statusBucket === "OVERDUE";
        }
        if (filterId === "high_scraping") {
          return Number(company.webscrapingUsage?.searchesToday || 0) >= 3;
        }
        if (filterId === "low_activation") {
          return Boolean(company.activationNeedsAttention) || !Boolean(company.emailConfirmation?.confirmed);
        }
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

  const financeMasterOverview = useMemo(() => {
    const companies = workspace?.companies || [];
    const referredCompanies = companies.filter(
      (company) =>
        Boolean(company.finance.isReferral) ||
        String(company.acquisitionSource || "").trim().toLowerCase() === "indicacao",
    );
    return {
      discountedCompanies: companies.filter(
        (company) =>
          company.finance.annualPlanDiscountPercent > 0 ||
          company.finance.manualDiscountPercent > 0 ||
          company.finance.referralDiscountValue > 0 ||
          company.finance.freeMonths > 0,
      ).length,
      pendingCompanies: companies.filter((company) => company.finance.pendingCount > 0).length,
      failedCompanies: companies.filter((company) => company.finance.failedCount > 0).length,
      refundCompanies: companies.filter((company) => company.finance.refundCount > 0).length,
      refundAmount: companies.reduce((total, company) => total + Number(company.finance.refundAmount || 0), 0),
      freeMonths: companies.reduce((total, company) => total + Number(company.finance.freeMonths || 0), 0),
      referredCompanies: referredCompanies.length,
      convertedReferrals: referredCompanies.filter((company) =>
        companyHasOperationalAccess(company),
      ).length,
      referralDiscountCompanies: companies.filter(
        (company) => company.finance.referralDiscountAppliedNow || Boolean(company.finance.referralDiscountConsumedAt),
      ).length,
      referralDiscountAmount: companies.reduce(
        (total, company) => total + Number(company.finance.referralDiscountValue || 0),
        0,
      ),
    };
  }, [workspace?.companies]);

  const controlTowerOverview = useMemo(() => {
    const companies = workspace?.companies || [];
    const pendingEmail = companies.filter((company) => !company.emailConfirmation?.confirmed).length;
    const trialEnding = companies.filter(
      (company) => company.statusBucket === "TRIAL_ENDING" || ((company.trialRemainingDays || 99) >= 0 && (company.trialRemainingDays || 99) <= 3),
    ).length;
    const lowActivation = companies.filter((company) => company.activationNeedsAttention).length;
    const whatsappPending = companies.filter((company) =>
      ["REQUESTED", "CONTACTED"].includes(String(company.whatsappCenter?.migration?.workflowStatus || "").trim().toUpperCase()),
    ).length;
    const paymentAttention = companies.filter(
      (company) => company.finance.pendingCount > 0 || company.finance.failedCount > 0 || company.statusBucket === "OVERDUE",
    ).length;
    const scrapingHeavy = companies.filter((company) => Number(company.webscrapingUsage?.searchesToday || 0) >= 3).length;
    const trialBlocked = companies.filter((company) => Number(company.webscrapingUsage?.blockedToday || 0) > 0).length;
    const cacheHits = companies.reduce(
      (total, company) => total + Number(company.webscrapingUsage?.globalCacheHitsToday || 0),
      0,
    );
    const avgCacheReuseRate =
      companies.length > 0
        ? Number(
            (
              companies.reduce(
                (total, company) => total + Number(company.webscrapingUsage?.globalCacheReuseRate || 0),
                0,
              ) / companies.length
            ).toFixed(1),
          )
        : 0;
    return {
      pendingEmail,
      trialEnding,
      lowActivation,
      whatsappPending,
      paymentAttention,
      scrapingHeavy,
      trialBlocked,
      cacheHits,
      avgCacheReuseRate,
    };
  }, [workspace?.companies]);

  const activeCompany = detail?.company || null;
  const activeContextCompanyId = currentUser?.masterContext?.active ? currentUser.masterContext.companyId : null;
  const activeCompanyInContext = activeContextCompanyId === activeCompany?.id;
  const activeOperationalStatus = activeCompany?.operationalStatus || null;
  const activeOperationalAttentionChips = (activeOperationalStatus?.statuses || []).filter((chip) => chip.tone !== "green");
  const activeOperationalLead = compactOperationalHint(
    activeOperationalStatus?.overallHint,
    "A régua operacional compartilhada ainda não retornou uma leitura para esta empresa.",
  );
  const activeOperationalFacts = [
    {
      id: "health",
      label: "Health geral",
      value: operationalHealthLabel(activeOperationalStatus?.overallHealth),
      tone: activeOperationalStatus?.overallHealth || "neutral",
    },
    ...(activeOperationalStatus?.accessReason
      ? [
          {
            id: "access-reason",
            label: "Motivo de acesso",
            value: compactOperationalHint(activeOperationalStatus.accessReason, "Sem motivo operacional."),
            tone: "neutral",
          },
        ]
      : []),
    ...(activeOperationalStatus?.accessSource
      ? [
          {
            id: "access-source",
            label: "Origem do acesso",
            value: operationalAccessSourceLabel(activeOperationalStatus.accessSource),
            tone: "neutral",
          },
        ]
      : []),
  ];
  const quickCompanyTarget = workspace?.companies.find((company) => String(company.id) === quickCompanyId) || null;

  function operationalContextBusyKey(companyId: number) {
    return `context-${companyId}`;
  }

  function operationalNavigationBusyKey(companyId: number, actionId: string) {
    return `operational-nav-${companyId}-${actionId}`;
  }

  function companyHasActiveMasterContext(companyId?: number | null) {
    return Boolean(currentUser?.masterContext?.active && currentUser.masterContext.companyId === companyId);
  }

  function renderAuditEntry(entry: AuditEntry) {
    const detailRows = buildAuditDetailRows(entry.metadata);
    const changeRows = buildAuditChangeRows(entry.metadata);

    return (
      <article key={entry.id} className={styles.timelineItem}>
        <div className={styles.timelineDot} />
        <div className={styles.auditEntryBody}>
          <div className={styles.timelineTopline}>
            <strong>{entry.action}</strong>
            <span>{formatDateTime(entry.createdAt)}</span>
          </div>
          <div className={styles.auditEntryMeta}>
            <span>{entry.scope}</span>
            <span className={badgeClass(auditSeverityTone(entry.severity))}>{entry.severity}</span>
          </div>
          {detailRows.length ? (
            <div className={styles.auditMetaGrid}>
              {detailRows.map((row) => (
                <div key={`${entry.id}-${row.key}`} className={styles.auditMetaItem}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
          {changeRows.length ? (
            <div className={styles.auditChangeList}>
              {changeRows.map((row) => (
                <div key={`${entry.id}-change-${row.key}`} className={styles.auditChangeRow}>
                  <span className={styles.auditChangeLabel}>{row.label}</span>
                  <div className={styles.auditChangeValues}>
                    <span>{row.before}</span>
                    <span className={styles.auditChangeArrow}>→</span>
                    <strong>{row.after}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  function beginOperationalAction(actionKey: string) {
    if (operationalActionLockRef.current) return false;
    if (operationalReleaseTimeoutRef.current != null && typeof window !== "undefined") {
      window.clearTimeout(operationalReleaseTimeoutRef.current);
      operationalReleaseTimeoutRef.current = null;
    }
    operationalActionLockRef.current = actionKey;
    setOperationalBusyAction(actionKey);
    return true;
  }

  function releaseOperationalAction(actionKey: string, holdMs = 0) {
    const unlock = () => {
      if (operationalReleaseTimeoutRef.current != null) {
        operationalReleaseTimeoutRef.current = null;
      }
      if (operationalActionLockRef.current === actionKey) {
        operationalActionLockRef.current = null;
      }
      setOperationalBusyAction((current) => (current === actionKey ? null : current));
    };

    if (holdMs > 0 && typeof window !== "undefined") {
      operationalReleaseTimeoutRef.current = window.setTimeout(unlock, holdMs);
      return;
    }

    unlock();
  }

  function isOperationalActionBusy(companyId: number, actionId?: string) {
    const current = operationalActionLockRef.current || operationalBusyAction || "";
    if (!current) return false;
    if (current === operationalContextBusyKey(companyId)) return true;
    if (!actionId) return current.startsWith(`operational-nav-${companyId}-`);
    return current === operationalNavigationBusyKey(companyId, actionId);
  }

  function isOperationalContextBusy(companyId: number) {
    const current = operationalActionLockRef.current || operationalBusyAction || "";
    return current === operationalContextBusyKey(companyId);
  }

  function hasOperationalActionPending() {
    return Boolean(operationalActionLockRef.current || operationalBusyAction);
  }

  function updateLocalMasterContext(company: CompanySummary) {
    setCurrentUser((current) =>
      current
        ? {
            ...current,
            masterContext: {
              active: true,
              companyId: company.id,
              companyName: company.name,
            },
          }
        : current,
    );
  }

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

  async function saveMasterBillingPolicy() {
    setBusyAction("master-billing-policy-save");
    setError(null);
    try {
      await apiFetch("/modules/master/billing-policy", {
        method: "PUT",
        body: JSON.stringify({
          annualPlanDiscountPercent: Number(masterIntegrationsDraft.annualPlanDiscountPercent || 0),
          extraSeatMonthlyAmount: Number(masterIntegrationsDraft.extraSeatMonthlyAmount || 0),
          referralDiscountActive: Boolean(masterIntegrationsDraft.referralDiscountActive),
          referralDiscountPercent: Number(masterIntegrationsDraft.referralDiscountPercent || 0),
          referralDiscountMode:
            String(masterIntegrationsDraft.referralDiscountMode || "").trim().toUpperCase() === "RECURRING"
              ? "RECURRING"
              : "ONCE",
        }),
      });
      setMessage("Política financeira global atualizada.");
      await loadWorkspace(true);
      if (activeCompany) {
        await loadDetail(activeCompany.id, drawerTab);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar política financeira do MASTER.");
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

  async function saveWhatsAppMigrationWorkflow() {
    if (!activeCompany || !whatsAppMigrationWorkflowDraft) return;
    setBusyAction(`whatsapp-migration-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/companies/master/${activeCompany.id}/whatsapp-migration-workflow`, {
        method: "PATCH",
        body: JSON.stringify({
          status: whatsAppMigrationWorkflowDraft.status,
          internalNote: whatsAppMigrationWorkflowDraft.internalNote.trim() || undefined,
          lastContactAt: whatsAppMigrationWorkflowDraft.lastContactAt
            ? new Date(whatsAppMigrationWorkflowDraft.lastContactAt).toISOString()
            : undefined,
        }),
      });
      setMessage("Workflow interno da Central WhatsApp atualizado.");
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao salvar o workflow interno da Central WhatsApp.",
      );
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
    if (companyHasActiveMasterContext(company.id)) {
      return;
    }
    const actionKey = operationalContextBusyKey(company.id);
    if (!beginOperationalAction(actionKey)) return;
    setError(null);
    try {
      await apiFetch("/master-context/assume", {
        method: "POST",
        headers: { "x-master-route": "/master" },
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
      releaseOperationalAction(actionKey);
    }
  }

  async function navigateOperational(company: CompanySummary, target: OperationalNavigationTarget) {
    const destination = resolveOperationalNavigationTarget(company, target);
    const actionKey = operationalNavigationBusyKey(company.id, destination.actionId);
    if (!beginOperationalAction(actionKey)) return;
    setError(null);
    let releaseDelay = 0;
    try {
      const needsContext = operationalHrefRequiresContext(destination.href);
      const hasActiveTargetContext = companyHasActiveMasterContext(company.id);
      if (needsContext && !hasActiveTargetContext) {
        await apiFetch("/master-context/assume", {
          method: "POST",
          headers: { "x-master-route": "/master" },
          body: JSON.stringify({ companyId: company.id, reason: `Diagnostico operacional: ${company.name}` }),
        });
        updateLocalMasterContext(company);
        dispatchMasterContextChanged({ mode: "assumed", companyName: company.name });
      }
      releaseDelay = 1200;
      router.push(destination.href);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Falha ao abrir ${destination.label}.`);
    } finally {
      releaseOperationalAction(actionKey, releaseDelay);
    }
  }

  async function exitContext() {
    setBusyAction("context-exit");
    setError(null);
    try {
      await apiFetch("/master-context/exit", {
        method: "POST",
        headers: { "x-master-route": "/master" },
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
      dispatchModulesChanged({ reason: "master_trial_changed" });
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
      dispatchModulesChanged({ reason: "master_payment_changed" });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar status financeiro.");
    } finally {
      setBusyAction(null);
    }
  }

  async function archiveCompany(companyId: number, reason: string) {
    setBusyAction(`archive-${companyId}`);
    setError(null);
    try {
      await apiFetch(`/companies/master/${companyId}/archive`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setMessage("Empresa arquivada com sucesso. O acesso foi bloqueado e o histórico foi preservado.");
      await refreshAll(companyId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao arquivar empresa.");
    } finally {
      setBusyAction(null);
    }
  }

  async function hardDeleteCompany(companyId: number, companyName: string, reason: string) {
    setBusyAction(`delete-${companyId}`);
    setError(null);
    try {
      await apiFetch(`/companies/master/${companyId}`, {
        method: "DELETE",
        body: JSON.stringify({
          confirmText: buildHardDeleteConfirmation(companyName),
          reason,
        }),
      });
      if (currentUser?.masterContext?.active && currentUser.masterContext.companyId === companyId) {
        dispatchMasterContextChanged({ mode: "exited", companyName: currentUser.masterContext.companyName || companyName });
      }
      setDrawerOpen(false);
      setDetail(null);
      setMessage("Empresa removida permanentemente. Usuários, módulos e vínculos operacionais também foram excluídos.");
      await loadWorkspace(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao excluir empresa permanentemente.");
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
        const payload = await apiFetch<{ temporaryPassword?: string | null }>(`/users/master/company/${userModal.companyId}/create`, {
          method: "POST",
          body: JSON.stringify({
            email: userModal.email.trim().toLowerCase(),
            username: userModal.username.trim() || undefined,
            name: userModal.name.trim() || undefined,
            role: userModal.role,
            password: userModal.password.trim() || undefined,
          }),
        });
        setMessage(
          payload?.temporaryPassword
            ? `Usuário criado com sucesso. Senha temporária: ${payload.temporaryPassword}`
            : "Usuário criado com sucesso.",
        );
      } else if (userModal.mode === "edit" && userModal.userId) {
        await apiFetch(`/users/master/${userModal.userId}`, {
          method: "PATCH",
          body: JSON.stringify({
            email: userModal.email.trim().toLowerCase(),
            username: userModal.username.trim(),
            name: userModal.name.trim(),
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
      dispatchModulesChanged({ reason: "master_manual_payment" });
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
      setMessage("Resumo da empresa salvo.");
      await refreshAll(activeCompany.id);
      dispatchModulesChanged({ reason: "master_profile_changed" });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar perfil.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveCompanyFinanceSettings() {
    if (!activeCompany || !financeSettingsDraft) return;
    setBusyAction(`finance-settings-${activeCompany.id}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${activeCompany.id}/finance-settings`, {
        method: "PUT",
        body: JSON.stringify({
          billingCycle: financeSettingsDraft.billingCycle,
          manualDiscountPercent: Number(financeSettingsDraft.manualDiscountPercent || 0),
          freeMonths: Number(financeSettingsDraft.freeMonths || 0),
        }),
      });
      setMessage(`Configuração financeira de ${activeCompany.name} atualizada.`);
      await refreshAll(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar desconto e ciclo da empresa.");
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
      dispatchModulesChanged({ reason: "master_module_changed" });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar módulo.");
    } finally {
      setBusyAction(null);
    }
  }

  async function changeCompanyPlan(companyId: number, planKey: string) {
    setBusyAction(`plan-${companyId}`);
    setError(null);
    try {
      await apiFetch(`/modules/master/company/${companyId}/plan`, {
        method: "PUT",
        body: JSON.stringify({ planKey }),
      });
      setMessage("Plano comercial atualizado. Acessos derivados do pacote foram sincronizados.");
      await refreshAll(companyId);
      dispatchModulesChanged({ reason: "master_plan_changed" });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao trocar plano comercial.");
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

  async function saveCompanyIntegration() {
    if (!activeCompany || !integrationEditor) return;

    const instanceName = integrationEditor.instanceName.trim();
    const secret = integrationEditor.secret.trim();
    const appKey = integrationEditor.appKey.trim();
    const baseUrl = integrationEditor.baseUrl.trim();
    const authMode = integrationEditor.authMode.trim();
    const externalAccountId = integrationEditor.externalAccountId.trim();

    if (!instanceName) {
      setError("Informe o nome da instância da integração.");
      return;
    }

    if (integrationEditor.mode === "create" && !secret) {
      setError("Informe a credencial inicial da integração.");
      return;
    }

    setBusyAction(`integration-save-${activeCompany.id}`);
    setError(null);
    try {
      const payload = {
        provider: integrationEditor.provider,
        instanceName,
        isActive: integrationEditor.isActive,
        ...(secret ? { secret } : {}),
        ...(appKey ? { appKey } : {}),
        baseUrl,
        authMode,
        externalAccountId,
      };

      if (integrationEditor.mode === "create") {
        await apiFetch(`/modules/master/company/${activeCompany.id}/integrations`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("Conexão de integração criada.");
      } else {
        await apiFetch(`/modules/master/company/${activeCompany.id}/integrations/${integrationEditor.connectionId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setMessage("Conexão de integração atualizada.");
      }

      setIntegrationEditor(null);
      await loadCompanyIntegrations(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar conexão de integração.");
    } finally {
      setBusyAction(null);
    }
  }

  async function testCompanyIntegration(connectionId: string) {
    if (!activeCompany) return;

    setBusyAction(`integration-test-${connectionId}`);
    setError(null);
    try {
      const payload = await apiFetch<{ ok: boolean; status: string; message?: string | null }>(
        `/modules/master/company/${activeCompany.id}/integrations/${connectionId}/test`,
        { method: "POST" },
      );
      setMessage(payload.message || `Teste concluído com status ${payload.status}.`);
      await loadCompanyIntegrations(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao testar conexão.");
    } finally {
      setBusyAction(null);
    }
  }

  async function syncCompanyIntegration(connectionId: string) {
    if (!activeCompany) return;

    setBusyAction(`integration-sync-${connectionId}`);
    setError(null);
    try {
      const payload = await apiFetch<{
        ok: boolean;
        importedCount?: number;
        updatedCount?: number;
        failedCount?: number;
        note?: string | null;
      }>(`/modules/master/company/${activeCompany.id}/integrations/${connectionId}/sync`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage(
        payload.note ||
          `Sync concluído. Importados: ${payload.importedCount || 0}, atualizados: ${payload.updatedCount || 0}, falhas: ${payload.failedCount || 0}.`,
      );
      await loadCompanyIntegrations(activeCompany.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao sincronizar integração.");
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
          <Link href="/master" className="btn btn-secondary btn-sm">
            Home Master
          </Link>
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
          <Link href="/master/sistema" className="btn btn-secondary btn-sm">
            Sistema
          </Link>
          <Link href="/master/exclusoes" className="btn btn-secondary btn-sm">
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
                  <p className={styles.sectionEyebrow}>Torre de controle</p>
                  <h2>Ativação real da base</h2>
                </div>
              </div>
              <div className={styles.controlTowerGrid}>
                <article className={styles.summaryCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Onboarding</p>
                      <h3>Confirmação e início de operação</h3>
                    </div>
                    <span className={badgeClass(controlTowerOverview.pendingEmail > 0 ? "danger" : "success")}>
                      {controlTowerOverview.pendingEmail} pendente(s)
                    </span>
                  </div>
                  <div className={styles.controlKpiGrid}>
                    <div className={styles.kpiMini}><span>E-mail pendente</span><strong>{controlTowerOverview.pendingEmail}</strong></div>
                    <div className={styles.kpiMini}><span>Trial acabando</span><strong>{controlTowerOverview.trialEnding}</strong></div>
                    <div className={styles.kpiMini}><span>Ativação fraca</span><strong>{controlTowerOverview.lowActivation}</strong></div>
                    <div className={styles.kpiMini}><span>Migração WhatsApp</span><strong>{controlTowerOverview.whatsappPending}</strong></div>
                  </div>
                  <div className={styles.summaryMeta}>
                    <p>Olhe primeiro empresas sem confirmação, trials vencendo e contas com acesso liberado mas baixa ativação.</p>
                  </div>
                </article>

                <article className={styles.summaryCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Webscraping</p>
                      <h3>Uso, bloqueios e economia de custo</h3>
                    </div>
                    <span className={badgeClass(controlTowerOverview.cacheHits > 0 ? "success" : "neutral")}>
                      {controlTowerOverview.cacheHits} hit(s) de cache
                    </span>
                  </div>
                  <div className={styles.controlKpiGrid}>
                    <div className={styles.kpiMini}><span>Uso forte</span><strong>{controlTowerOverview.scrapingHeavy}</strong></div>
                    <div className={styles.kpiMini}><span>Bloqueio trial</span><strong>{controlTowerOverview.trialBlocked}</strong></div>
                    <div className={styles.kpiMini}><span>Cache global</span><strong>{controlTowerOverview.cacheHits}</strong></div>
                    <div className={styles.kpiMini}><span>Reuso médio</span><strong>{controlTowerOverview.avgCacheReuseRate}%</strong></div>
                  </div>
                  <div className={styles.summaryMeta}>
                    <p>O histórico privado segue isolado. Aqui você enxerga só sinais técnicos de reaproveitamento público entre empresas.</p>
                  </div>
                </article>

                <article className={styles.summaryCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Financeiro + WhatsApp</p>
                      <h3>Pendências que travam ativação</h3>
                    </div>
                    <span className={badgeClass(controlTowerOverview.paymentAttention > 0 ? "danger" : "success")}>
                      {controlTowerOverview.paymentAttention} em atenção
                    </span>
                  </div>
                  <div className={styles.controlKpiGrid}>
                    <div className={styles.kpiMini}><span>Pagamento</span><strong>{controlTowerOverview.paymentAttention}</strong></div>
                    <div className={styles.kpiMini}><span>WhatsApp pend.</span><strong>{controlTowerOverview.whatsappPending}</strong></div>
                    <div className={styles.kpiMini}><span>Trials</span><strong>{summary.activeTrials?.value?.toLocaleString("pt-BR") || "0"}</strong></div>
                    <div className={styles.kpiMini}><span>Pagantes</span><strong>{summary.payingClients?.value?.toLocaleString("pt-BR") || "0"}</strong></div>
                  </div>
                  <div className={styles.summaryMeta}>
                    <p>O objetivo aqui é enxergar quem já pode crescer, quem precisa de cobrança e quem ainda depende de ajuda técnica.</p>
                  </div>
                </article>
              </div>
            </section>

            <section className={styles.attentionSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Financeiro MASTER</p>
                  <h2>Trials, descontos e pressão de cobrança</h2>
                </div>
                <div className={styles.rowActions}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMasterIntegrationsOpen(true)}>
                    Tokens globais
                  </button>
                </div>
              </div>
              <div className={styles.attentionGrid}>
                <article className={styles.summaryCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Política comercial</p>
                      <h3>Descontos globais sem hardcode</h3>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={saveMasterBillingPolicy}
                      disabled={busyAction === "master-billing-policy-save"}
                    >
                      {busyAction === "master-billing-policy-save" ? "Salvando..." : "Salvar política"}
                    </button>
                  </div>
                  <div className={styles.formGrid}>
                    <input
                      className="field"
                      inputMode="decimal"
                      placeholder="Desconto anual (%)"
                      value={String(masterIntegrationsDraft.annualPlanDiscountPercent ?? 0)}
                      onChange={(event) =>
                        setMasterIntegrationsDraft((current) => ({
                          ...current,
                          annualPlanDiscountPercent: Number(event.target.value || 0),
                        }))
                      }
                    />
                    <input
                      className="field"
                      inputMode="decimal"
                      placeholder="Desconto por indicação (%)"
                      value={String(masterIntegrationsDraft.referralDiscountPercent ?? 0)}
                      onChange={(event) =>
                        setMasterIntegrationsDraft((current) => ({
                          ...current,
                          referralDiscountPercent: Number(event.target.value || 0),
                        }))
                      }
                    />
                    <input
                      className="field"
                      inputMode="decimal"
                      placeholder="Valor mensal por assento extra"
                      value={String(masterIntegrationsDraft.extraSeatMonthlyAmount ?? 0)}
                      onChange={(event) =>
                        setMasterIntegrationsDraft((current) => ({
                          ...current,
                          extraSeatMonthlyAmount: Number(event.target.value || 0),
                        }))
                      }
                    />
                    <select
                      className="field"
                      value={masterIntegrationsDraft.referralDiscountMode || "ONCE"}
                      onChange={(event) =>
                        setMasterIntegrationsDraft((current) => ({
                          ...current,
                          referralDiscountMode: event.target.value === "RECURRING" ? "RECURRING" : "ONCE",
                        }))
                      }
                    >
                      <option value="ONCE">Indicação única</option>
                      <option value="RECURRING">Indicação recorrente</option>
                    </select>
                    <label className={styles.inlineCheck}>
                      <input
                        type="checkbox"
                        checked={Boolean(masterIntegrationsDraft.referralDiscountActive)}
                        onChange={(event) =>
                          setMasterIntegrationsDraft((current) => ({
                            ...current,
                            referralDiscountActive: event.target.checked,
                          }))
                        }
                      />
                      Ativar desconto por indicação
                    </label>
                  </div>
                  <div className={styles.summaryMeta}>
                    <p>Esse percentual entra apenas quando a empresa estiver no ciclo anual.</p>
                    <p>Hoje: {Number(masterIntegrationsDraft.annualPlanDiscountPercent || 0)}% de desconto global.</p>
                    <p>Assento extra: {formatCurrency(Number(masterIntegrationsDraft.extraSeatMonthlyAmount || 0))}/mês após 2 usuários ativos.</p>
                    <p>
                      Indicação: {Boolean(masterIntegrationsDraft.referralDiscountActive) ? "ativa" : "inativa"} •{" "}
                      {Number(masterIntegrationsDraft.referralDiscountPercent || 0)}% •{" "}
                      {referralModeLabel(masterIntegrationsDraft.referralDiscountMode)}
                    </p>
                    <p>Use indicação como alavanca comercial leve, sem burocratizar o cadastro.</p>
                  </div>
                </article>

                <article className={styles.summaryCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Leitura rápida</p>
                      <h3>Saúde financeira da base</h3>
                    </div>
                  </div>
                  <div className={styles.summaryStats}>
                    <div><span>Trials</span><strong>{summary.activeTrials?.value?.toLocaleString("pt-BR") || "0"}</strong></div>
                    <div><span>Pendências</span><strong>{financeMasterOverview.pendingCompanies}</strong></div>
                    <div><span>Falhas</span><strong>{financeMasterOverview.failedCompanies}</strong></div>
                    <div><span>Com desconto</span><strong>{financeMasterOverview.discountedCompanies}</strong></div>
                  </div>
                  <div className={styles.summaryMeta}>
                    <p>Meses grátis ativos na base: {financeMasterOverview.freeMonths}</p>
                    <p>Empresas com estorno: {financeMasterOverview.refundCompanies}</p>
                    <p>Valor total estornado: {formatCurrency(financeMasterOverview.refundAmount)}</p>
                    <p>Clientes por indicação: {financeMasterOverview.referredCompanies}</p>
                    <p>Indicações convertidas: {financeMasterOverview.convertedReferrals}</p>
                    <p>Descontos por indicação concedidos: {financeMasterOverview.referralDiscountCompanies}</p>
                    <p>Valor atual em indicação: {formatCurrency(financeMasterOverview.referralDiscountAmount)}</p>
                  </div>
                </article>
              </div>
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
                      <th>Onboarding</th>
                      <th>Trial</th>
                      <th>Webscraping</th>
                      <th>Financeiro</th>
                      <th>Operacional</th>
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
                            <span>{company.primaryContactName || company.contactEmail || "Sem contato principal"}</span>
                            <span>{company.contactPhone || "Sem telefone"} • CPF/CNPJ: {company.taxDocument || "-"}</span>
                            <span>{`WhatsApp • ${whatsappStatusLabel(company)}`}</span>
                            <span>{whatsappModeLabel(company.whatsappSituation?.mode, company.whatsappCenter)}</span>
                          </button>
                        </td>
                        <td>
                          <div className={styles.secondaryCell}>
                            <strong>{company.onboardingLabel || onboardingStatusLabel(company.onboardingStatus)}</strong>
                            <span>
                              {company.emailConfirmation?.confirmed
                                ? `E-mail confirmado • ${company.emailConfirmation.confirmedUsersCount} usuário(s)`
                                : "E-mail ainda não confirmado"}
                            </span>
                            <span>Módulo inicial: {trialModuleLabel(company.trialModuleSelection)}</span>
                            <span>Ativação: {activationStatusLabel(company.activationStatus)}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.secondaryCell}>
                            <strong>{company.trialRemainingDays != null ? `${company.trialRemainingDays} dia(s)` : "-"}</strong>
                            <span>{bucketLabel(company.statusBucket)} • {paymentStatusLabel(company.paymentStatus)}</span>
                            <span>{company.plan?.name || "Sem plano"} • {company.finance.billingCycle === "ANNUAL" ? "anual" : "mensal"}</span>
                            <span>Próx. vencimento: {formatDate(company.nextDueAt)}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.secondaryCell}>
                            <strong>{company.webscrapingUsage.lastSearchAt ? webscrapingSourceLabel(company.webscrapingUsage.lastSearchSource) : "Sem uso recente"}</strong>
                            <span>
                              Hoje: {company.webscrapingUsage.searchesToday} busca(s) • bloqueios {company.webscrapingUsage.blockedToday}
                            </span>
                            <span>
                              Última: {company.webscrapingUsage.lastSearchAt ? `${formatDateTime(company.webscrapingUsage.lastSearchAt)} • ${company.webscrapingUsage.lastSearchUser || "sem usuário"}` : "nenhuma"}
                            </span>
                            <span>
                              Cache global: {company.webscrapingUsage.globalCacheHitsToday} hit(s) • reuso {company.webscrapingUsage.globalCacheReuseRate}%
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.secondaryCell}>
                            <strong>{company.billingSituation?.statusLabel || company.financialSituation}</strong>
                            <span>
                              {company.billingSituation?.hasPendingIssues ? "Com pendências" : "Sem pendências"} •{" "}
                              {company.finance.pendingCount} pend. • {company.finance.failedCount} falha(s) •{" "}
                              {company.finance.refundCount} estorno(s)
                            </span>
                            <span>
                              {formatCurrency(company.billingSituation?.currentCycleAmount ?? company.finance.finalCycleAmount)} •{" "}
                              {paymentMethodLabel(company.billingSituation?.paymentMethod || company.paymentMethod)}
                              {company.billingSituation?.provider ? ` • ${company.billingSituation.provider}` : ""}
                            </span>
                            <span>
                              Aberto: {formatCurrency(company.billingSituation?.amountDue ?? company.currentOutstandingValue)} •{" "}
                              Venc.: {formatDate(company.billingSituation?.nextDueAt || company.nextDueAt)} •{" "}
                              atraso {company.billingSituation?.daysOverdue ?? company.daysOverdue} dia(s)
                            </span>
                            <span>
                              Desc.: {company.finance.annualPlanDiscountPercent}% anual / {company.finance.manualDiscountPercent}% manual / {company.finance.freeMonths} mês(es) grátis
                            </span>
                            <span>
                              Origem: {acquisitionSourceLabel(company.acquisitionSource)}
                              {company.referralReferrerName ? ` • Indicador: ${company.referralReferrerName}` : company.referralCode ? ` • Código: ${company.referralCode}` : ""}
                            </span>
                            {company.finance.isReferral ? (
                              <span>
                                Indicação convertida • {company.finance.referralDiscountPercent}%{" "}
                                {referralModeLabel(company.finance.referralDiscountMode)}
                                {company.finance.referralDiscountAppliedNow
                                  ? ` • abatimento atual ${formatCurrency(company.finance.referralDiscountValue)}`
                                  : company.finance.referralDiscountConsumedAt
                                    ? ` • consumido em ${formatDate(company.finance.referralDiscountConsumedAt)}`
                                    : " • aguardando primeira cobrança"}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <div className={styles.secondaryCell}>
                            <strong>
                              <span className={operationalBadgeClass(company.operationalStatus?.overallHealth)}>
                                {company.operationalStatus?.overallLabel || "Sem leitura"}
                              </span>
                            </strong>
                            <div className={styles.operationalRail}>
                              {(company.operationalStatus?.statuses || []).map((chip) => {
                                const chipActionId = `chip-${chip.key}`;
                                const chipBusy = isOperationalActionBusy(company.id, chipActionId);
                                return (
                                  <button
                                    key={chip.key}
                                    type="button"
                                    className={styles.operationalChip}
                                    data-tone={chip.tone}
                                    data-busy={chipBusy}
                                    title={chip.hint || chip.detail}
                                    aria-busy={chipBusy}
                                    disabled={hasOperationalActionPending()}
                                    onClick={() => void navigateOperational(company, { kind: "chip", chip })}
                                  >
                                    <span>{chip.shortLabel}</span>
                                    <strong>{chipBusy ? "Abrindo..." : chip.value}</strong>
                                  </button>
                                );
                              })}
                            </div>
                            <span>{compactOperationalHint(company.operationalStatus?.overallHint, "Sem hint operacional.")}</span>
                            <span>Última leitura: {formatDateTime(company.operationalStatus?.lastCheckedAt)}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.modulePills}>
                            {company.modules.slice(0, 3).map((module) => (
                              <span key={module.key} className="badge">{module.name}</span>
                            ))}
                            {company.modules.length > 3 ? <span className="badge">+{company.modules.length - 3}</span> : null}
                          </div>
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={`btn btn-secondary btn-sm ${styles.operationalActionButton}`}
                              onClick={() => assumeContext(company)}
                              disabled={companyHasActiveMasterContext(company.id) || hasOperationalActionPending()}
                            >
                              {companyHasActiveMasterContext(company.id)
                                ? "Contexto ativo"
                                : isOperationalContextBusy(company.id)
                                  ? "Assumindo..."
                                  : hasOperationalActionPending()
                                  ? "Processando..."
                                  : "Assumir contexto"}
                            </button>
                            <button
                              type="button"
                              className={`btn btn-secondary btn-sm ${styles.operationalActionButton}`}
                              onClick={() => void navigateOperational(company, { kind: "whatsapp" })}
                              disabled={hasOperationalActionPending()}
                            >
                              {isOperationalActionBusy(company.id, "whatsapp") ? "Abrindo..." : "Abrir WhatsApp"}
                            </button>
                            <button
                              type="button"
                              className={`btn btn-secondary btn-sm ${styles.operationalActionButton}`}
                              onClick={() => void navigateOperational(company, { kind: "finance" })}
                              disabled={hasOperationalActionPending()}
                            >
                              {isOperationalActionBusy(company.id, "finance") ? "Abrindo..." : "Abrir Financeiro"}
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
                  <button
                    type="button"
                    className={`btn btn-primary btn-sm ${styles.operationalActionButton}`}
                    onClick={() => assumeContext(activeCompany)}
                    disabled={hasOperationalActionPending()}
                  >
                    {isOperationalContextBusy(activeCompany.id)
                      ? "Assumindo..."
                      : hasOperationalActionPending()
                        ? "Processando..."
                        : "Assumir contexto"}
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
                {drawerTab === "summary" ? (
                  <>
                    <section className={styles.summaryCard}>
                      <div className={styles.operationalPriorityBlock}>
                        <div className={styles.operationalPriorityHeader}>
                          <div className={styles.operationalPriorityCopy}>
                            <div className={styles.operationalPriorityTitleRow}>
                              <p className={styles.sectionEyebrow}>Prioridade operacional</p>
                              <span className={styles.operationalPriorityCaption}>Mesmo status do topo e da listagem MASTER</span>
                            </div>
                            <h3>{activeOperationalStatus?.overallLabel || "Sem leitura operacional"}</h3>
                            <p className={styles.operationalPriorityLead}>{activeOperationalLead}</p>
                          </div>
                          <div className={styles.operationalPriorityHealth} data-tone={activeOperationalStatus?.overallHealth || "neutral"}>
                            <span className={operationalBadgeClass(activeOperationalStatus?.overallHealth)}>
                              {operationalHealthLabel(activeOperationalStatus?.overallHealth)}
                            </span>
                            <strong>{activeOperationalStatus?.overallLabel || "Sem leitura"}</strong>
                            <p className={styles.operationalPriorityAssist}>{activeOperationalLead}</p>
                            <span>Última leitura: {formatDateTime(activeOperationalStatus?.lastCheckedAt)}</span>
                          </div>
                        </div>

                        <div className={styles.operationalPriorityFacts}>
                          {activeOperationalFacts.map((fact) => (
                            <article key={fact.id} className={styles.operationalPriorityFact} data-tone={fact.tone}>
                              <span className={styles.operationalPriorityFactLabel}>{fact.label}</span>
                              <strong className={styles.operationalPriorityFactValue}>{fact.value}</strong>
                            </article>
                          ))}
                        </div>

                        {activeOperationalStatus?.statuses?.length ? (
                          <div className={styles.operationalPriorityRail}>
                            <div className={`${styles.operationalRail} ${styles.operationalPriorityChipRail}`}>
                              {activeOperationalStatus.statuses.map((chip) => {
                                const chipActionId = `chip-${chip.key}`;
                                const chipBusy = isOperationalActionBusy(activeCompany.id, chipActionId);
                                return (
                                  <button
                                    key={chip.key}
                                    type="button"
                                    className={styles.operationalChip}
                                    data-tone={chip.tone}
                                    data-busy={chipBusy}
                                    title={chip.hint || chip.detail}
                                    aria-busy={chipBusy}
                                    disabled={hasOperationalActionPending()}
                                    onClick={() => void navigateOperational(activeCompany, { kind: "chip", chip })}
                                  >
                                    <span>{chip.shortLabel}</span>
                                    <strong>{chipBusy ? "Abrindo..." : chip.value}</strong>
                                  </button>
                                );
                              })}
                            </div>

                            <div className={styles.operationalPriorityHintList}>
                              {activeOperationalAttentionChips.length ? (
                                activeOperationalAttentionChips.map((chip) => (
                                  <article key={chip.key} className={styles.operationalPriorityHint} data-tone={chip.tone}>
                                    <strong>{chip.label}</strong>
                                    <span>{compactOperationalHint(chip.hint || chip.detail)}</span>
                                  </article>
                                ))
                              ) : (
                                <article className={styles.operationalPriorityHint} data-tone="green">
                                  <strong>Sem bloqueios imediatos</strong>
                                  <span>Todos os motores operacionais estão verdes na leitura atual.</span>
                                </article>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className={styles.operationalPriorityEmpty}>
                            Os chips operacionais ainda não estão disponíveis para esta empresa.
                          </div>
                        )}

                        <div className={styles.drawerQuickActions}>
                          <button
                            type="button"
                            className={`btn btn-primary btn-sm ${styles.operationalActionButton}`}
                            onClick={() => assumeContext(activeCompany)}
                            disabled={activeCompanyInContext || hasOperationalActionPending()}
                          >
                            {activeCompanyInContext
                              ? "Contexto ativo"
                              : isOperationalContextBusy(activeCompany.id)
                                ? "Assumindo..."
                                : hasOperationalActionPending()
                                  ? "Processando..."
                                : "Assumir contexto"}
                          </button>
                          <button
                            type="button"
                            className={`btn btn-secondary btn-sm ${styles.operationalActionButton}`}
                            onClick={() => void navigateOperational(activeCompany, { kind: "whatsapp" })}
                            disabled={hasOperationalActionPending()}
                          >
                            {isOperationalActionBusy(activeCompany.id, "whatsapp") ? "Abrindo..." : "Abrir WhatsApp"}
                          </button>
                          <button
                            type="button"
                            className={`btn btn-secondary btn-sm ${styles.operationalActionButton}`}
                            onClick={() => void navigateOperational(activeCompany, { kind: "finance" })}
                            disabled={hasOperationalActionPending()}
                          >
                            {isOperationalActionBusy(activeCompany.id, "finance") ? "Abrindo..." : "Abrir Financeiro"}
                          </button>
                        </div>
                      </div>
                    </section>

                    <section className={styles.summaryCard}>
                      <div className={styles.panelCardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Resumo</p>
                          <h3>Identidade da empresa e contexto operacional</h3>
                        </div>
                        <div className={styles.rowActions}>
                          <button type="button" className="btn btn-primary btn-sm" onClick={saveProfile}>
                            Salvar resumo
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openCompany(activeCompany.id, "finance")}>
                            Ver cobrança
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDrawerTab("audit")}>
                            Ver auditoria
                          </button>
                        </div>
                      </div>
                      <div className={styles.formGrid}>
                        <input className="field" placeholder="Nome da empresa" value={profileDraft?.name || ""} onChange={(event) => setProfileDraft((current) => current ? { ...current, name: event.target.value } : current)} />
                        <input className="field" placeholder="Responsável" value={profileDraft?.primaryContactName || ""} onChange={(event) => setProfileDraft((current) => current ? { ...current, primaryContactName: event.target.value } : current)} />
                        <input className="field" placeholder="E-mail principal" value={profileDraft?.contactEmail || ""} onChange={(event) => setProfileDraft((current) => current ? { ...current, contactEmail: event.target.value } : current)} />
                        <input className="field" placeholder="Telefone principal" value={profileDraft?.contactPhone || ""} onChange={(event) => setProfileDraft((current) => current ? { ...current, contactPhone: event.target.value } : current)} />
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
                          <option value="manual">Premium manual</option>
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
                          Liberar acesso operacional manualmente
                        </label>
                      </div>
                    </section>

                    <section className={styles.summaryCard}>
                      <div className={styles.panelCardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Panorama</p>
                          <h3>Operação, website e módulos</h3>
                        </div>
                        <div className={styles.rowActions}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => launchWebsite(activeCompany.id, "public")}>
                            Abrir website
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => launchWebsite(activeCompany.id, "admin")}>
                            Abrir admin
                          </button>
                        </div>
                      </div>
                      <div className={styles.summaryMeta}>
                        <p>Plano atual: {activeCompany.plan?.name || "Sem plano"} • {formatCurrency(activeCompany.monthlyValue)}</p>
                        <p>Cobrança operacional: {paymentStatusLabel(activeCompany.paymentStatus)} • {subscriptionLabel(activeCompany.subscriptionStatus)}</p>
                        <p>Forma de pagamento: {paymentMethodLabel(activeCompany.paymentMethod)} • Provider: {activeCompany.billingProvider || "manual"}</p>
                        <p>Website: {activeCompany.website.enabled ? "Habilitado" : "Desligado"} • {activeCompany.website.configured ? "Configurado" : "Pendente"}</p>
                        <p>Módulos ativos: {activeCompany.modules.filter((module) => module.enabled).map((module) => module.name).join(", ") || "Nenhum módulo ativo"}</p>
                        <p>Situação financeira: {buildStatusExplanation(activeCompany)}</p>
                      </div>
                    </section>

                    <section className={styles.summaryCard}>
                      <div className={styles.panelCardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Ativação real</p>
                          <h3>Onboarding, trial, scraping e vínculo</h3>
                        </div>
                      </div>
                      <div className={styles.summaryStats}>
                        <div><span>Onboarding</span><strong>{activeCompany.onboardingLabel || onboardingStatusLabel(activeCompany.onboardingStatus)}</strong></div>
                        <div><span>E-mail</span><strong>{activeCompany.emailConfirmation?.confirmed ? "Confirmado" : "Pendente"}</strong></div>
                        <div><span>Módulo inicial</span><strong>{trialModuleLabel(activeCompany.trialModuleSelection)}</strong></div>
                        <div><span>Ativação</span><strong>{activationStatusLabel(activeCompany.activationStatus)}</strong></div>
                      </div>
                      <div className={styles.summaryMeta}>
                        <p>Busca recente: {activeCompany.webscrapingUsage.lastSearchAt ? `${formatDateTime(activeCompany.webscrapingUsage.lastSearchAt)} • ${activeCompany.webscrapingUsage.lastSearchUser || "sem usuário"}` : "nenhuma ainda"}</p>
                        <p>Hoje no scraping: {activeCompany.webscrapingUsage.searchesToday} busca(s) • {activeCompany.webscrapingUsage.blockedToday} bloqueio(s)</p>
                        <p>Cache global: {activeCompany.webscrapingUsage.globalCacheHitsToday} hit(s) • reuso {activeCompany.webscrapingUsage.globalCacheReuseRate}%</p>
                        <p>Última origem de scraping: {webscrapingSourceLabel(activeCompany.webscrapingUsage.lastSearchSource)}</p>
                        <p>
                          Central WhatsApp: {activeCompany.whatsappSituation?.statusLabel || activeCompany.whatsappCenter?.statusLabel || "Não conectado"} •{" "}
                          {whatsappModeLabel(activeCompany.whatsappSituation?.mode, activeCompany.whatsappCenter)}
                        </p>
                      </div>
                    </section>

                    <section className={styles.summaryCard}>
                      <div className={styles.panelCardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Histórico de trial</p>
                          <h3>Linha do tempo operacional</h3>
                        </div>
                      </div>
                      <div className={styles.timeline}>
                        {activeCompany.trialHistory.length ? (
                          activeCompany.trialHistory.map(renderAuditEntry)
                        ) : (
                          <div className={styles.emptyPanel}>Nenhum histórico de trial para esta empresa.</div>
                        )}
                      </div>
                    </section>
                  </>
                ) : null}

                {drawerTab === "finance" ? (
                  <>
                    <section className={styles.summaryCard}>
                      <div className={styles.panelCardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Status atual</p>
                          <h3>Operação e cobrança lidas separadamente</h3>
                        </div>
                      </div>
                      <div className={styles.summaryMeta}>
                        <p>paymentStatus: {paymentStatusLabel(activeCompany.paymentStatus)}</p>
                        <p>subscriptionStatus: {subscriptionLabel(activeCompany.subscriptionStatus)}</p>
                        <p>paymentMethod: {paymentMethodLabel(activeCompany.paymentMethod)}</p>
                        <p>billingProvider: {activeCompany.billingProvider || "manual"}</p>
                        <p>trialStartsAt: {formatDate(activeCompany.trialStartsAt)}</p>
                        <p>trialEndsAt: {formatDate(activeCompany.trialEndsAt)}</p>
                        <p>trialRemainingDays: {formatDayCount(activeCompany.trialRemainingDays)}</p>
                        <p>nextDueAt: {formatDate(activeCompany.nextDueAt)}</p>
                        <p>daysOverdue: {formatDayCount(activeCompany.daysOverdue)}</p>
                        <p>currentOutstandingValue: {formatCurrency(activeCompany.currentOutstandingValue)}</p>
                        <p>billingCycle: {activeCompany.finance.billingCycle === "ANNUAL" ? "Anual" : "Mensal"}</p>
                        <p>finalCycleAmount: {formatCurrency(activeCompany.finance.finalCycleAmount)}</p>
                        <p>pendingCount: {activeCompany.finance.pendingCount}</p>
                        <p>failedCount: {activeCompany.finance.failedCount}</p>
                        <p>refundCount: {activeCompany.finance.refundCount}</p>
                        <p>manualPaymentPending: {activeCompany.manualPaymentPending ? "Sim" : "Não"}</p>
                        <p>recentCardFailure: {activeCompany.recentCardFailure ? "Sim" : "Não"}</p>
                        <p>lastPayment: {activeCompany.lastPayment ? `${formatDateTime(activeCompany.lastPayment.paidAt)} • ${formatCurrency(activeCompany.lastPayment.amount)}` : "Sem histórico"}</p>
                        <p>lastFailure: {activeCompany.lastFailure ? `${formatDateTime(activeCompany.lastFailure.createdAt)} • ${activeCompany.lastFailure.status}` : "Sem falha recente"}</p>
                      </div>
                      <div className={styles.noticeGrid}>
                        <article className={styles.noticeCard}>
                          <strong>Encerrar trial</strong>
                          <p>Encerrar trial só bloqueia acesso, marca expirado e desativa módulos. Não gera cobrança automática.</p>
                        </article>
                        <article className={styles.noticeCard}>
                          <strong>Marcar pago</strong>
                          <p>Marcar pago sem ledger é apenas mudança operacional. Para financeiro real, use lançamento manual.</p>
                        </article>
                      </div>
                    </section>

                    <section className={styles.summaryCard}>
                      <div className={styles.panelCardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Trial</p>
                          <h3>Vigência, extensão e bloqueio de acesso</h3>
                        </div>
                      </div>
                      <div className={styles.summaryStats}>
                        <div><span>Começa em</span><strong>{formatDate(activeCompany.trialStartsAt)}</strong></div>
                        <div><span>Termina em</span><strong>{formatDate(activeCompany.trialEndsAt)}</strong></div>
                        <div><span>Faltam</span><strong>{formatDayCount(activeCompany.trialRemainingDays)}</strong></div>
                        <div><span>Regra operacional</span><strong>{buildOperationalRule(activeCompany)}</strong></div>
                      </div>
                      <div className={styles.drawerQuickActions}>
                        <input className="field" type="number" min="1" max="365" value={trialDaysDraft} onChange={(event) => setTrialDaysDraft(event.target.value)} />
                        <button type="button" className="btn btn-secondary btn-sm" disabled={!Number(trialDaysDraft)} onClick={() => runTrialAction(activeCompany.id, { action: "extend", days: Number(trialDaysDraft) }, `Trial prorrogado em ${trialDaysDraft} dias.`)}>
                          Prorrogar trial
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => runTrialAction(activeCompany.id, { action: "reactivate", days: 7 }, "Trial reativado por 7 dias.")}>
                          Reativar trial
                        </button>
                        <input className="field" type="date" value={trialDateDraft} onChange={(event) => setTrialDateDraft(event.target.value)} />
                        <button type="button" className="btn btn-secondary btn-sm" disabled={!trialDateDraft} onClick={() => runTrialAction(activeCompany.id, { action: "set_date", endsAt: `${trialDateDraft}T12:00:00` }, "Data do trial atualizada.")}>
                          Definir data final
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setConfirmAction({
                            title: "Encerrar trial",
                            description: `O trial de ${activeCompany.name} será encerrado agora.`,
                            confirmLabel: "Encerrar trial",
                            tone: "danger",
                            details: [
                              "Desativa a empresa imediatamente.",
                              "Desativa todos os módulos liberados para a empresa.",
                              "Marca o cliente como expirado no plano operacional.",
                              "Não cria cobrança automática nem gera ledger financeiro.",
                            ],
                            run: async () => {
                              setConfirmAction(null);
                              await runTrialAction(activeCompany.id, { action: "end" }, "Trial encerrado.");
                            },
                          })}
                        >
                          Encerrar trial
                        </button>
                      </div>
                    </section>

                    <section className={styles.summaryCard}>
                      <div className={styles.panelCardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Cobrança</p>
                          <h3>Cobrança operacional, descontos e leitura do cliente</h3>
                        </div>
                      </div>
                      <div className={styles.summaryStats}>
                        <div><span>Forma de pagamento</span><strong>{paymentMethodLabel(activeCompany.paymentMethod)}</strong></div>
                        <div><span>Provider</span><strong>{activeCompany.billingProvider || "manual"}</strong></div>
                        <div><span>Ciclo</span><strong>{activeCompany.finance.billingCycle === "ANNUAL" ? "Anual" : "Mensal"}</strong></div>
                        <div><span>Usuários ativos</span><strong>{activeCompany.finance.activeUsers ?? 0}</strong></div>
                        <div><span>Inclusos</span><strong>{activeCompany.finance.includedActiveUsers ?? 2}</strong></div>
                        <div><span>Assentos extras</span><strong>{activeCompany.finance.extraActiveUsers ?? 0}</strong></div>
                        <div><span>Valor base</span><strong>{formatCurrency(activeCompany.finance.baseCycleAmount)}</strong></div>
                        <div><span>Valor final</span><strong>{formatCurrency(activeCompany.finance.finalCycleAmount)}</strong></div>
                        <div><span>Desc. anual</span><strong>{activeCompany.finance.annualPlanDiscountPercent}%</strong></div>
                        <div><span>Desc. manual</span><strong>{activeCompany.finance.manualDiscountPercent}%</strong></div>
                        <div><span>Desc. indicação</span><strong>{activeCompany.finance.referralDiscountPercent}%</strong></div>
                        <div><span>Meses grátis</span><strong>{activeCompany.finance.freeMonths}</strong></div>
                        <div><span>Pendências</span><strong>{activeCompany.finance.pendingCount}</strong></div>
                        <div><span>Falhas</span><strong>{activeCompany.finance.failedCount}</strong></div>
                        <div><span>Estornos</span><strong>{activeCompany.finance.refundCount}</strong></div>
                        <div><span>Valor estornado</span><strong>{formatCurrency(activeCompany.finance.refundAmount)}</strong></div>
                      </div>
                      <div className={styles.summaryMeta}>
                        <p>Último pagamento: {activeCompany.lastPayment ? `${formatDateTime(activeCompany.lastPayment.paidAt)} • ${formatCurrency(activeCompany.lastPayment.amount)}` : "Sem histórico"}</p>
                        <p>Última falha: {activeCompany.lastFailure ? `${formatDateTime(activeCompany.lastFailure.createdAt)} • ${activeCompany.lastFailure.status}` : "Sem falha recente"}</p>
                        <p>Pagamento manual pendente: {activeCompany.manualPaymentPending ? "Sim" : "Não"}</p>
                        <p>Falha recente em cartão: {activeCompany.recentCardFailure ? "Sim" : "Não"}</p>
                        <p>Cartão cadastrado: {activeCompany.finance.cardConfigured ? `${activeCompany.finance.cardBrand || "Cartão"} • **** ${activeCompany.finance.cardLast4 || "----"}` : "Não"}</p>
                        <p>
                          Assentos extras: {activeCompany.finance.extraActiveUsers ?? 0} x {formatCurrency(activeCompany.finance.extraSeatMonthlyAmount ?? 0)}/mês = {formatCurrency(activeCompany.finance.extraSeatCycleAmount ?? 0)} no ciclo.
                        </p>
                        <p>Pix disponível: {activeCompany.finance.pixAvailable ? "Sim" : "Não"}</p>
                        <p>
                          Origem comercial: {acquisitionSourceLabel(activeCompany.acquisitionSource)}
                          {activeCompany.acquisitionSourceDetail ? ` • ${activeCompany.acquisitionSourceDetail}` : ""}
                        </p>
                        <p>
                          Quem indicou: {activeCompany.referralReferrerName || activeCompany.referralCode || "Não informado"}
                        </p>
                        <p>
                          Desconto por indicação: {activeCompany.finance.isReferral ? `${activeCompany.finance.referralDiscountPercent}% • ${referralModeLabel(activeCompany.finance.referralDiscountMode)}` : "Não aplicável"}
                        </p>
                        <p>
                          Situação da indicação: {activeCompany.finance.referralDiscountAppliedNow
                            ? `abatimento atual de ${formatCurrency(activeCompany.finance.referralDiscountValue)}`
                            : activeCompany.finance.referralDiscountConsumedAt
                              ? `já consumido em ${formatDate(activeCompany.finance.referralDiscountConsumedAt)}`
                              : activeCompany.finance.isReferral
                                ? "apto para validação na cobrança"
                                : "sem indicação"}
                        </p>
                      </div>
                    </section>

                    <section className={styles.summaryCard}>
                      <div className={styles.panelCardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Descontos e ciclo</p>
                          <h3>Configuração financeira por empresa</h3>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={saveCompanyFinanceSettings}
                          disabled={!financeSettingsDraft || busyAction === `finance-settings-${activeCompany.id}`}
                        >
                          {busyAction === `finance-settings-${activeCompany.id}` ? "Salvando..." : "Salvar ajustes"}
                        </button>
                      </div>
                      <div className={styles.formGrid}>
                        <select
                          className="field"
                          value={financeSettingsDraft?.billingCycle || "MONTHLY"}
                          onChange={(event) =>
                            setFinanceSettingsDraft((current) =>
                              current ? { ...current, billingCycle: event.target.value === "ANNUAL" ? "ANNUAL" : "MONTHLY" } : current,
                            )
                          }
                        >
                          <option value="MONTHLY">Mensal</option>
                          <option value="ANNUAL">Anual</option>
                        </select>
                        <input
                          className="field"
                          inputMode="decimal"
                          placeholder="Desconto manual (%)"
                          value={financeSettingsDraft?.manualDiscountPercent || "0"}
                          onChange={(event) =>
                            setFinanceSettingsDraft((current) =>
                              current ? { ...current, manualDiscountPercent: event.target.value } : current,
                            )
                          }
                        />
                        <input
                          className="field"
                          inputMode="numeric"
                          placeholder="Meses grátis"
                          value={financeSettingsDraft?.freeMonths || "0"}
                          onChange={(event) =>
                            setFinanceSettingsDraft((current) =>
                              current ? { ...current, freeMonths: event.target.value } : current,
                            )
                          }
                        />
                      </div>
                      <div className={styles.summaryMeta}>
                        <p>Desconto anual global em vigor: {activeCompany.finance.annualPlanDiscountPercent}%.</p>
                        <p>
                          Indicação desta conta: {activeCompany.finance.isReferral ? "Sim" : "Não"} •{" "}
                          política {activeCompany.finance.referralDiscountPercent}%{" "}
                          {referralModeLabel(activeCompany.finance.referralDiscountMode)}
                        </p>
                        <p>Use este bloco para ajustar manualmente cada cliente sem quebrar a lógica atual de billing.</p>
                      </div>
                    </section>

                    <section className={styles.summaryCard}>
                      <div className={styles.panelCardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Histórico financeiro</p>
                          <h3>Ledger real e lançamentos manuais</h3>
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

                    <section className={styles.summaryCard}>
                      <div className={styles.panelCardHeader}>
                        <div>
                          <p className={styles.sectionEyebrow}>Ações rápidas</p>
                          <h3>Ações operacionais sem confundir com financeiro real</h3>
                        </div>
                      </div>
                      <div className={styles.noticeGrid}>
                        <article className={styles.noticeCard}>
                          <strong>Lançar financeiro manual</strong>
                          <p>Cria ledger de verdade, pode regularizar a empresa e documenta o histórico financeiro.</p>
                        </article>
                        <article className={styles.noticeCard}>
                          <strong>Marcar pago / suspender</strong>
                          <p>São ações operacionais. Ajustam acesso e status, mas não substituem um lançamento manual.</p>
                        </article>
                        <article className={styles.noticeCard}>
                          <strong>Premium manual</strong>
                          <p>Liberar acesso excepcional sem gerar cobrança. Fica claro no MASTER que não é pago real nem trial.</p>
                        </article>
                      </div>
                      <div className={styles.rowActions}>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => openManualPayment(activeCompany)}>
                          Lançar financeiro manual
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setConfirmAction({
                            title: "Marcar pago sem ledger",
                            description: `${activeCompany.name} será marcada como paga apenas no plano operacional.`,
                            confirmLabel: "Marcar pago",
                            tone: "primary",
                            details: [
                              "Libera acesso e ajusta a janela operacional atual.",
                              "Não cria lançamento financeiro no ledger.",
                              "Use 'Lançar financeiro manual' se precisar de cobrança real.",
                            ],
                            run: async () => {
                              setConfirmAction(null);
                              await setPaymentStatus(activeCompany.id, "PAID", "Cliente marcado como pago no plano operacional.");
                            },
                          })}
                        >
                          Marcar pago
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setConfirmAction({
                            title: "Liberar premium manual",
                            description: `${activeCompany.name} ficará com acesso operacional excepcional, sem cobrança real.`,
                            confirmLabel: "Liberar premium manual",
                            tone: "primary",
                            details: [
                              "Ativa a empresa e libera os módulos normalmente.",
                              "Define o estado como premium manual, separado de pago e trial.",
                              "Não cria lançamento financeiro nem simula pagamento.",
                            ],
                            run: async () => {
                              setConfirmAction(null);
                              await setPaymentStatus(activeCompany.id, "MANUAL", "Acesso premium manual liberado no plano operacional.");
                            },
                          })}
                        >
                          Premium manual
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setConfirmAction({
                            title: "Suspender acesso",
                            description: `${activeCompany.name} será suspensa agora.`,
                            confirmLabel: "Suspender empresa",
                            tone: "danger",
                            details: [
                              "Desativa a empresa e todos os módulos.",
                              "Atualiza paymentStatus para DISABLED.",
                              "Não cria cobrança automática nem ledger financeiro.",
                            ],
                            run: async () => {
                              setConfirmAction(null);
                              await setPaymentStatus(activeCompany.id, "DISABLED", "Empresa suspensa no plano operacional.");
                            },
                          })}
                        >
                          Suspender acesso
                        </button>
                      </div>
                    </section>
                  </>
                ) : null}

                {drawerTab === "users" ? (
                  <section className={styles.summaryCard}>
                    <div className={styles.panelCardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Segurança operacional</p>
                        <h3>Usuários</h3>
                        <p>Crie USER ou ADMIN para esta empresa, edite dados de acesso e preserve o fluxo de reset já existente.</p>
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
                            name: "",
                            role: "USER",
                            password: "",
                          })
                        }
                      >
                        Criar usuário
                      </button>
                    </div>
                    <div className={styles.userList}>
                      {activeCompany.users.length === 0 ? (
                        <div className={styles.emptyPanel}>Nenhum usuário cadastrado para esta empresa.</div>
                      ) : null}
                      {activeCompany.users.map((user) => (
                        <article key={user.id} className={styles.userCard}>
                          <div>
                            <strong>{user.name || user.username || user.email || `#${user.id}`}</strong>
                            <p>{user.email || "Sem e-mail"}{user.name ? ` • Login: ${user.username || "-"}` : ""}</p>
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
                                  userLabel: user.name || user.username || user.email || `#${user.id}`,
                                  email: user.email || "",
                                  username: user.username || "",
                                  name: user.name || "",
                                  role: user.role === "ADMIN" ? "ADMIN" : "USER",
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
                                  userLabel: user.name || user.username || user.email || `#${user.id}`,
                                  email: user.email || "",
                                  username: user.username || "",
                                  name: user.name || "",
                                  role: user.role === "ADMIN" ? "ADMIN" : "USER",
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
                                  description: `O usuário ${user.name || user.username || user.email || `#${user.id}`} será removido desta empresa.`,
                                  confirmLabel: "Deletar usuário",
                                  tone: "danger",
                                  run: async () => {
                                    setConfirmAction(null);
                                    await deleteUser(activeCompany.id, user.id, user.name || user.username || user.email || `#${user.id}`);
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
                        <p className={styles.sectionEyebrow}>Plano comercial</p>
                        <h3>{commercialPlanLabel(activeCompany.selectedPlanKey)}</h3>
                      </div>
                      <div className={styles.summaryMeta}>
                        <p>Valor do pacote: {formatCurrency(activeCompany.monthlyValue || 0)}/mês</p>
                      </div>
                    </div>
                    <div className={styles.formGrid}>
                      <label>
                        <span>Trocar plano da empresa</span>
                        <select
                          className="field"
                          value={activeCompany.selectedPlanKey || ""}
                          disabled={busyAction === `plan-${activeCompany.id}`}
                          onChange={(event) => void changeCompanyPlan(activeCompany.id, event.target.value)}
                        >
                          <option value="" disabled>Selecione um pacote</option>
                          {COMMERCIAL_PLAN_OPTIONS.map((plan) => (
                            <option key={plan.key} value={plan.key}>
                              {plan.label} • {plan.price}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {!companyHasOperationalAccess(activeCompany) ? (
                      <div className="alert alert-error">
                        Esta empresa está sem acesso liberado. Os módulos só podem ser operados quando houver trial ativo ou cobrança ativa.
                      </div>
                    ) : null}
                    <p className={styles.helperText}>Módulos abaixo são permissões internas derivadas do plano. Alterações manuais continuam possíveis apenas como exceção auditável.</p>
                    <div className={styles.moduleList}>
                      {activeCompany.modules.map((module) => (
                        <label key={module.key} className={styles.moduleToggle}>
                          <div>
                            <strong>{module.name}</strong>
                            <p>{module.key} • permissão interna</p>
                          </div>
                          <button type="button" className={module.enabled ? styles.toggleOn : styles.toggleOff} onClick={() => toggleModule(activeCompany.id, module.key, module.enabled)} disabled={!companyHasOperationalAccess(activeCompany)}>
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
                        <h3>Operação por empresa e credenciais MASTER</h3>
                      </div>
                      <div className={styles.rowActions}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIntegrationEditor(buildIntegrationEditor())}>
                          Nova conexão
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMasterIntegrationsOpen(true)}>
                          Editar credenciais MASTER
                        </button>
                      </div>
                    </div>
                    <div className={styles.summaryMeta}>
                      <p>AUVO e TagPlus usam provider explícito, segredo mascarado, teste manual e sincronização controlada por empresa.</p>
                      <p>As credenciais nunca voltam em texto puro; apenas o preview mascarado e o resumo operacional ficam visíveis.</p>
                    </div>

                    {integrationEditor ? (
                      <article className={styles.userCard}>
                        <div className={styles.panelCardHeader}>
                          <div>
                            <strong>{integrationEditor.mode === "create" ? "Nova conexão operacional" : "Editar conexão operacional"}</strong>
                            <p>Cadastre AUVO ou TagPlus sem expor o segredo salvo. Em edição, deixe token e App Key em branco para preservar os segredos atuais.</p>
                          </div>
                          <div className={styles.rowActions}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIntegrationEditor(null)}>
                              Cancelar
                            </button>
                            <button type="button" className="btn btn-primary btn-sm" onClick={saveCompanyIntegration} disabled={busyAction === `integration-save-${activeCompany.id}`}>
                              {busyAction === `integration-save-${activeCompany.id}` ? "Salvando..." : integrationEditor.mode === "create" ? "Criar conexão" : "Salvar conexão"}
                            </button>
                          </div>
                        </div>
                        <div className={styles.formGrid}>
                          <select
                            className="field"
                            value={integrationEditor.provider}
                            onChange={(event) =>
                              setIntegrationEditor((current) =>
                                current
                                  ? {
                                      ...current,
                                      provider: event.target.value === "TAGPLUS" ? "TAGPLUS" : "AUVO",
                                    }
                                  : current,
                              )
                            }
                            disabled={integrationEditor.mode === "edit"}
                          >
                            {INTEGRATION_PROVIDER_OPTIONS.map((providerOption) => (
                              <option key={providerOption.id} value={providerOption.id}>
                                {providerOption.label}
                              </option>
                            ))}
                          </select>
                          <input
                            className="field"
                            placeholder="Nome da instância"
                            value={integrationEditor.instanceName}
                            onChange={(event) =>
                              setIntegrationEditor((current) =>
                                current ? { ...current, instanceName: event.target.value } : current,
                              )
                            }
                          />
                          <input
                            className="field"
                            placeholder={
                              INTEGRATION_PROVIDER_OPTIONS.find((providerOption) => providerOption.id === integrationEditor.provider)?.secretLabel || "Token da integração"
                            }
                            value={integrationEditor.secret}
                            onChange={(event) =>
                              setIntegrationEditor((current) =>
                                current ? { ...current, secret: event.target.value } : current,
                              )
                            }
                          />
                          {integrationEditor.provider === "AUVO" ? (
                            <input
                              className="field"
                              placeholder="App Key AUVO opcional"
                              value={integrationEditor.appKey}
                              onChange={(event) =>
                                setIntegrationEditor((current) =>
                                  current ? { ...current, appKey: event.target.value } : current,
                                )
                              }
                            />
                          ) : null}
                          <input
                            className="field"
                            placeholder="Base URL override opcional"
                            value={integrationEditor.baseUrl}
                            onChange={(event) =>
                              setIntegrationEditor((current) =>
                                current ? { ...current, baseUrl: event.target.value } : current,
                              )
                            }
                          />
                          <input
                            className="field"
                            placeholder={integrationEditor.provider === "AUVO" ? "Auth mode AUVO opcional" : "Auth mode TagPlus opcional"}
                            value={integrationEditor.authMode}
                            onChange={(event) =>
                              setIntegrationEditor((current) =>
                                current ? { ...current, authMode: event.target.value } : current,
                              )
                            }
                          />
                          <input
                            className="field"
                            placeholder="External account ID opcional"
                            value={integrationEditor.externalAccountId}
                            onChange={(event) =>
                              setIntegrationEditor((current) =>
                                current ? { ...current, externalAccountId: event.target.value } : current,
                              )
                            }
                          />
                          <label className={styles.checkboxCard}>
                            <input
                              type="checkbox"
                              checked={integrationEditor.isActive}
                              onChange={(event) =>
                                setIntegrationEditor((current) =>
                                  current ? { ...current, isActive: event.target.checked } : current,
                                )
                              }
                            />
                            Conexão ativa
                          </label>
                        </div>
                        <div className={styles.summaryMeta}>
                          <p>Deixe `baseUrl`, `authMode` e `externalAccountId` vazios para usar o runtime padrão do ambiente. Preencha apenas quando o contrato homologado do cliente exigir override por conexão.</p>
                        </div>
                      </article>
                    ) : null}

                    <article className={styles.userCard}>
                      <div className={styles.panelCardHeader}>
                        <div>
                          <strong>AUVO e TagPlus por empresa</strong>
                          <p>Teste a conexão, acompanhe o último erro e rode sincronização manual para projetar `CustomerProfile` e `DebtCase`.</p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => activeCompany && loadCompanyIntegrations(activeCompany.id)}
                          disabled={integrationsLoading}
                        >
                          {integrationsLoading ? "Atualizando..." : "Atualizar lista"}
                        </button>
                      </div>
                      {integrationsLoading ? <div className={styles.emptyPanel}>Carregando integrações...</div> : null}
                      {!integrationsLoading && !companyIntegrations.length ? (
                        <div className={styles.emptyPanel}>Nenhuma conexão operacional cadastrada para esta empresa.</div>
                      ) : null}
                      <div className={styles.userList}>
                        {companyIntegrations.map((connection) => (
                          <article key={connection.id} className={styles.userCard}>
                            <div className={styles.panelCardHeader}>
                              <div>
                                <strong>{connection.providerModel?.label || connection.provider} • {connection.instanceName}</strong>
                                <p>
                                  {connection.providerModel?.adapterMode === "scaffold" ? "Modo scaffold honesto" : "Modo operacional"}
                                  {connection.providerModel?.syncTargets?.length ? ` • ${connection.providerModel.syncTargets.join(" + ")}` : ""}
                                </p>
                              </div>
                              <div className={styles.rowActions}>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIntegrationEditor(buildIntegrationEditor(connection))}>
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => testCompanyIntegration(connection.id)}
                                  disabled={busyAction === `integration-test-${connection.id}`}
                                >
                                  {busyAction === `integration-test-${connection.id}` ? "Testando..." : "Testar conexão"}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => syncCompanyIntegration(connection.id)}
                                  disabled={busyAction === `integration-sync-${connection.id}` || !connection.isActive}
                                >
                                  {busyAction === `integration-sync-${connection.id}` ? "Sincronizando..." : "Sincronizar agora"}
                                </button>
                              </div>
                            </div>
                            <div className={styles.modulePills}>
                              <span className={badgeClass(integrationStatusTone(connection.status))}>{connection.status}</span>
                              <span className={badgeClass(connection.isActive ? "success" : "warning")}>
                                {connection.isActive ? "Ativa" : "Inativa"}
                              </span>
                              <span className={badgeClass(connection.secretConfigured ? "success" : "danger")}>
                                {connection.secretConfigured ? "Credencial pronta" : "Sem credencial"}
                              </span>
                            </div>
                            <div className={styles.summaryMeta}>
                              <p>Preview da credencial: {connection.secretPreview || "Não configurado"}</p>
                              <p>Último teste: {formatDateTime(connection.lastTestedAt)} • Resultado: {connection.lastTestStatus || "-"}</p>
                              <p>Último sucesso: {formatDateTime(connection.lastSuccessAt)} • Último sync: {formatDateTime(connection.lastSyncAt)}</p>
                              <p>Última mensagem de teste: {connection.lastTestMessage || "-"}</p>
                              <p>Último erro: {connection.lastError || "-"}</p>
                              <p>Base URL override: {connection.connectionConfig?.baseUrl || "usando runtime do ambiente"}</p>
                              <p>Auth mode: {connection.connectionConfig?.authMode || "usando runtime do ambiente"}</p>
                              <p>Conta externa: {connection.connectionConfig?.externalAccountId || "não configurada"}</p>
                            </div>
                            {connection.credentialSummary?.fields?.length ? (
                              <div className={styles.modulePills}>
                                {connection.credentialSummary.fields.map((field) => (
                                  <span key={field.key} className={badgeClass(field.configured ? "success" : "warning")}>
                                    {field.label}: {field.configured ? "OK" : "Pendente"}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {connection.providerModel?.notes?.length ? (
                              <div className={styles.summaryMeta}>
                                {connection.providerModel.notes.map((note, index) => (
                                  <p key={`${connection.id}-note-${index}`}>{note}</p>
                                ))}
                              </div>
                            ) : null}
                            {connection.lastSyncRun ? (
                              <div className="msg-info">
                                <div className="text-sm">
                                  Última execução: {connection.lastSyncRun.status} • importados {connection.lastSyncRun.importedCount} • atualizados {connection.lastSyncRun.updatedCount} • falhas {connection.lastSyncRun.failedCount}
                                  {connection.lastSyncRun.finishedAt ? ` • concluído em ${formatDateTime(connection.lastSyncRun.finishedAt)}` : ""}
                                  {connection.lastSyncRun.errorSummary ? ` • ${connection.lastSyncRun.errorSummary}` : ""}
                                </div>
                              </div>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </article>

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
                          <p>Leitura normalizada para QR rápido, Meta oficial e credencial global do Master.</p>
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
                          <button type="button" className={styles.iconOnlyButton} onClick={() => setIntegrationVisibility((current) => ({ ...current, whatsapp_company: !current.whatsapp_company }))} aria-label="Ver estado do token de WhatsApp da empresa">
                            <EyeIcon />
                          </button>
                        </div>
                      </div>
                      <div className={styles.modulePills}>
                        <span className={badgeClass((activeCompany.whatsappSituation?.usingMasterToken ?? activeCompany.whatsapp.usingMasterToken) ? "success" : "warning")}>
                          {(activeCompany.whatsappSituation?.usingMasterToken ?? activeCompany.whatsapp.usingMasterToken) ? "Usando credencial MASTER" : "Usando token próprio"}
                        </span>
                        <span className="badge">
                          {activeCompany.whatsapp.masterCredentialLabel || "Nenhuma credencial selecionada"}
                        </span>
                        <span className={badgeClass(whatsappSituationTone(activeCompany.whatsappSituation, activeCompany.whatsappCenter))}>
                          {activeCompany.whatsappSituation?.statusLabel || activeCompany.whatsappCenter?.statusLabel || "Não conectado"}
                        </span>
                        <span className="badge">{whatsappModeLabel(activeCompany.whatsappSituation?.mode, activeCompany.whatsappCenter)}</span>
                        {activeCompany.whatsappSituation?.numberLabel ? (
                          <span className="badge">{activeCompany.whatsappSituation.numberLabel}</span>
                        ) : null}
                      </div>
                      <div className={styles.summaryMeta}>
                        <p>{activeCompany.whatsappSituation?.nextStepLabel || activeCompany.whatsappCenter?.statusHint || "Sem leitura de produto para o vínculo do WhatsApp."}</p>
                        <p>QR rápido = teste/onboarding rápido • Meta oficial = produção • Token Master = credencial global controlada pelo Master.</p>
                        {activeCompany.whatsappSituation?.hasError ? (
                          <p>Erro seguro: {activeCompany.whatsappSituation.errorMessageSafe || "Revisar configuração do WhatsApp."}</p>
                        ) : null}
                        <p>
                          Migração técnica:{" "}
                          {activeCompany.whatsappCenter?.migration.interestRequested
                            ? `${activeCompany.whatsappCenter?.migration.workflowStatus || "REQUESTED"} • ${activeCompany.whatsappCenter?.migration.requestedAt ? formatDateTime(activeCompany.whatsappCenter.migration.requestedAt) : "solicitada"}`
                            : "não solicitada"}
                        </p>
                        <p>
                          Último contato técnico: {formatDateTime(activeCompany.whatsappCenter?.migration.lastContactAt)}
                        </p>
                      </div>
                      <div className={styles.formGrid}>
                        <label>
                          <span className={styles.sectionEyebrow}>Workflow interno</span>
                          <select
                            className="field"
                            value={whatsAppMigrationWorkflowDraft?.status || "REQUESTED"}
                            onChange={(event) =>
                              setWhatsAppMigrationWorkflowDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      status: event.target.value as "REQUESTED" | "CONTACTED" | "RESOLVED",
                                    }
                                  : current,
                              )
                            }
                          >
                            <option value="REQUESTED">REQUESTED</option>
                            <option value="CONTACTED">CONTACTED</option>
                            <option value="RESOLVED">RESOLVED</option>
                          </select>
                        </label>
                        <label>
                          <span className={styles.sectionEyebrow}>Último contato técnico</span>
                          <input
                            className="field"
                            type="datetime-local"
                            value={whatsAppMigrationWorkflowDraft?.lastContactAt || ""}
                            onChange={(event) =>
                              setWhatsAppMigrationWorkflowDraft((current) =>
                                current ? { ...current, lastContactAt: event.target.value } : current,
                              )
                            }
                          />
                        </label>
                        <label className={styles.formSpanFull}>
                          <span className={styles.sectionEyebrow}>Observação interna</span>
                          <textarea
                            className="field"
                            rows={3}
                            placeholder="Ex: cliente pediu retorno amanhã às 14h, prefere seguir pela Meta oficial."
                            value={whatsAppMigrationWorkflowDraft?.internalNote || ""}
                            onChange={(event) =>
                              setWhatsAppMigrationWorkflowDraft((current) =>
                                current ? { ...current, internalNote: event.target.value } : current,
                              )
                            }
                          />
                        </label>
                      </div>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={saveWhatsAppMigrationWorkflow}
                          disabled={!activeCompany.whatsappCenter?.migration.interestRequested || busyAction === `whatsapp-migration-${activeCompany.id}`}
                        >
                          {busyAction === `whatsapp-migration-${activeCompany.id}` ? "Salvando..." : "Salvar workflow interno"}
                        </button>
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
                      {integrationVisibility.whatsapp_company && activeCompany.whatsapp.companyAccessTokenConfigured ? (
                        <div className="msg-info"><div className="text-sm">Token próprio configurado; valor completo oculto por segurança.</div></div>
                      ) : null}
                      {activeCompany.whatsapp.masterAccessTokenConfigured ? (
                        <div className="msg-info">
                          <div className="text-sm">
                            Número MASTER: {activeCompany.whatsapp.masterDisplayNumber || "-"} • Phone ID: {activeCompany.whatsapp.masterPhoneNumberId || "-"}
                            {integrationVisibility.whatsapp_master && activeCompany.whatsapp.masterAccessTokenConfigured
                              ? " • Token: oculto por segurança"
                              : ""}
                          </div>
                          <button type="button" className={styles.iconOnlyButton} onClick={() => setIntegrationVisibility((current) => ({ ...current, whatsapp_master: !current.whatsapp_master }))} aria-label="Ver estado do token master de WhatsApp">
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
                          <button type="button" className={styles.iconOnlyButton} onClick={() => setIntegrationVisibility((current) => ({ ...current, [endpoint.id]: !current[endpoint.id] }))} aria-label="Ver estado do token do endpoint">
                            <EyeIcon />
                          </button>
                          {integrationVisibility[endpoint.id] ? (
                            <div className="msg-info"><div className="text-sm">{endpoint.accessTokenConfigured ? "Token do endpoint configurado; valor completo oculto por segurança." : "Sem token neste endpoint"}</div></div>
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
                      {activeCompany.auditTimeline.length ? (
                        activeCompany.auditTimeline.map(renderAuditEntry)
                      ) : (
                        <div className={styles.emptyPanel}>Nenhuma auditoria registrada para esta empresa.</div>
                      )}
                    </div>
                  </section>
                ) : null}

                {drawerTab === "danger" ? (
                  <section className={styles.summaryCard}>
                    <div className={styles.panelCardHeader}>
                      <div>
                        <p className={styles.sectionEyebrow}>Perigo</p>
                        <h3>Arquivamento seguro e exclusão permanente real</h3>
                      </div>
                    </div>

                    <div className={styles.contextBannerStrong}>
                      <strong>Zona sensível</strong>
                      <span>Arquivar preserva histórico. Excluir permanentemente apaga a empresa, os usuários e os vínculos operacionais; apenas um registro mínimo da remoção fica no MASTER.</span>
                    </div>

                    <div className={styles.dangerGrid}>
                      <article className={styles.dangerCard}>
                        <div>
                          <p className={styles.sectionEyebrow}>Arquivar empresa</p>
                          <h3>Bloquear operação sem apagar dados</h3>
                        </div>
                        <div className={styles.summaryMeta}>
                          <p>Desativa a empresa e os módulos.</p>
                          <p>Preserva auditoria, histórico financeiro, integrações e configuração.</p>
                          <p>Não executa hard delete e não remove registros operacionais.</p>
                        </div>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={busyAction === `archive-${activeCompany.id}` || isArchivedOrSuspended(activeCompany)}
                            onClick={() => setConfirmAction({
                              title: "Arquivar empresa",
                              description: `${activeCompany.name} terá o acesso bloqueado, os módulos serão desligados e os dados serão preservados.`,
                              confirmLabel: "Arquivar empresa",
                              tone: "danger",
                              details: [
                                "Desativa a empresa imediatamente.",
                                "Desativa todos os módulos da empresa.",
                                "Mantém histórico, auditoria, website, integrações e ledger.",
                                "Não chama o hard delete atual.",
                              ],
                              run: async () => {
                                setConfirmAction(null);
                                await archiveCompany(activeCompany.id, "Arquivada pelo drawer premium do MASTER");
                              },
                            })}
                          >
                            {isArchivedOrSuspended(activeCompany) ? "Empresa já arquivada/suspensa" : "Arquivar empresa"}
                          </button>
                        </div>
                      </article>

                      <article className={styles.dangerCard}>
                        <div>
                          <p className={styles.sectionEyebrow}>Excluir permanentemente</p>
                          <h3>Apagar empresa e dados vinculados</h3>
                        </div>
                        <div className={styles.summaryMeta}>
                          <p>Remove empresa, usuários, módulos, integrações, financeiro operacional, scraping, recovery, leads, website e mensagens vinculadas.</p>
                          <p>O MASTER mantém apenas um snapshot mínimo da remoção para auditoria e rastreabilidade.</p>
                          <p>Empresas sem usuário entram automaticamente em remoção permanente após 7 dias.</p>
                        </div>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={busyAction === `delete-${activeCompany.id}`}
                            onClick={() => setConfirmAction({
                              title: "Excluir empresa permanentemente",
                              description: `${activeCompany.name} será apagada do sistema com os usuários e vínculos operacionais associados.`,
                              confirmLabel: "Excluir permanentemente",
                              tone: "danger",
                              details: [
                                "A empresa e os usuários dela serão removidos fisicamente.",
                                "Leads, recovery, integrações, website, billing operacional, scraping e mensagens vinculadas também serão apagados.",
                                "O MASTER preserva apenas um histórico mínimo da remoção para auditoria.",
                                "Se uma empresa ficar sem usuários, esse mesmo fluxo roda automaticamente após 7 dias.",
                              ],
                              confirmationKeyword: buildHardDeleteConfirmation(activeCompany.name),
                              confirmationInputLabel: "Digite a frase abaixo para liberar o hard delete",
                              run: async () => {
                                setConfirmAction(null);
                                await hardDeleteCompany(
                                  activeCompany.id,
                                  activeCompany.name,
                                  "Hard delete executado pelo drawer premium do MASTER",
                                );
                              },
                            })}
                          >
                            {busyAction === `delete-${activeCompany.id}` ? "Excluindo..." : "Excluir permanentemente"}
                          </button>
                        </div>
                      </article>
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
              <p>Status: {masterIntegrationsDraft.whatsappLibrary.some((entry) => entry.configured || (entry.accessToken && entry.phoneNumberId)) ? "Configurado" : "Pendente"}</p>
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
                      <button type="button" className={styles.iconOnlyButton} onClick={() => setIntegrationVisibility((current) => ({ ...current, [credential.key]: !current[credential.key] }))} aria-label="Alternar visibilidade do novo token master de WhatsApp">
                        <EyeIcon />
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeMasterWhatsAppCredential(credential.key)}>
                        Remover
                      </button>
                    </div>
                  </div>
                  <div className={styles.formGrid}>
                    <input className="field" placeholder="Nome da credencial" value={credential.label || ""} onChange={(event) => updateMasterWhatsAppCredential(credential.key, { label: event.target.value })} />
                    <input className="field" type={integrationVisibility[credential.key] ? "text" : "password"} placeholder={credential.accessTokenPreview ? `Token configurado (${credential.accessTokenPreview})` : "Access token do WhatsApp"} value={credential.accessToken || ""} onChange={(event) => updateMasterWhatsAppCredential(credential.key, { accessToken: event.target.value })} />
                    <input className="field" placeholder="Phone Number ID" value={credential.phoneNumberId || ""} onChange={(event) => updateMasterWhatsAppCredential(credential.key, { phoneNumberId: event.target.value })} />
                    <input className="field" placeholder="WABA ID" value={credential.wabaId || ""} onChange={(event) => updateMasterWhatsAppCredential(credential.key, { wabaId: event.target.value })} />
                    <input className="field" placeholder="Número WhatsApp" value={credential.whatsappNumber || ""} onChange={(event) => updateMasterWhatsAppCredential(credential.key, { whatsappNumber: event.target.value })} />
                    <input className="field" placeholder="Número exibido" value={credential.displayNumber || ""} onChange={(event) => updateMasterWhatsAppCredential(credential.key, { displayNumber: event.target.value })} />
                  </div>
                  <div className={styles.summaryMeta}>
                    <p>{credential.sourceCompanyName ? `Empresa herdada: ${credential.sourceCompanyName}` : "Credencial criada direto no MASTER"}</p>
                    <p>{credential.configured || (credential.accessToken && credential.phoneNumberId) ? "Pronta para uso" : "Dados incompletos"}</p>
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

      <ModalShell open={moduleCatalogOpen} onClose={() => setModuleCatalogOpen(false)} title="Permissões internas" subtitle="Módulos podem ser liberados por plano ou por override auditável; preço fica no pacote comercial." wide>
        <div className={styles.modalBody}>
          <div className={styles.contextBannerStrong}>
            <strong>Catálogo operacional do HBX</strong>
            <span>Módulo não é produto vendido. O cliente compra HBX List, HBX Lead ou HBX Full — Bot e IA.</span>
          </div>
          <div className={styles.moduleCatalogGrid}>
            {commercialModuleDrafts.map((moduleItem) => (
              <article key={moduleItem.key} className={styles.userCard}>
                <div>
                  <strong>{moduleItem.name}</strong>
                  <p>{moduleItem.key}</p>
                </div>
                <input className="field" placeholder="Nome do módulo" value={moduleItem.name} onChange={(event) => setModuleCatalogDrafts((current) => ({ ...current, [moduleItem.key]: { ...current[moduleItem.key], name: event.target.value } }))} />
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
                <input className="field" placeholder="Nome do atendente/vendedor" value={userModal.name} onChange={(event) => setUserModal((current) => current ? { ...current, name: event.target.value } : current)} />
                <input className="field" placeholder="Login / username" value={userModal.username} onChange={(event) => setUserModal((current) => current ? { ...current, username: event.target.value } : current)} />
                <select className="field" value={userModal.role} onChange={(event) => setUserModal((current) => current ? { ...current, role: event.target.value as "USER" | "ADMIN" } : current)}>
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
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
            {confirmAction.details?.length ? (
              <div className={styles.noticeGrid}>
                {confirmAction.details.map((detail, index) => (
                  <article key={`${confirmAction.title}-${index}`} className={styles.noticeCard}>
                    <p>{detail}</p>
                  </article>
                ))}
              </div>
            ) : null}
            {confirmAction.confirmationKeyword ? (
              <div className={styles.modalConfirmBlock}>
                <label className={styles.sectionEyebrow}>{confirmAction.confirmationInputLabel || "Confirmação digitada"}</label>
                <input
                  className="field"
                  value={confirmActionInput}
                  onChange={(event) => setConfirmActionInput(event.target.value)}
                  placeholder={confirmAction.confirmationKeyword}
                />
              </div>
            ) : null}
            <div className={styles.modalActions}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmAction(null)}>Cancelar</button>
              <button
                type="button"
                className={confirmAction.tone === "danger" ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"}
                onClick={() => void confirmAction.run()}
                disabled={Boolean(confirmAction.confirmationKeyword) && confirmActionInput.trim() !== confirmAction.confirmationKeyword}
              >
                {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        ) : null}
      </ModalShell>
    </DashboardScaffold>
  );
}
