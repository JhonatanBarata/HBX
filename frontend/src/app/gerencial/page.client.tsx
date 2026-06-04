"use client";

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import HbxGuide1, { type HbxGuide1Tab } from "@/components/HbxGuide1";
import HbxMobileDock from "@/components/mobile/HbxMobileDock";
import { HbxEmptyState, HbxSection, HbxStatusBadge } from "@/components/ui";
import CommissionSummaryPanel from "./_components/CommissionSummaryPanel";
import PartnerCreateForm from "./_components/PartnerCreateForm";
import PartnerOnboardingPanel from "./_components/PartnerOnboardingPanel";
import ReferralCandidatesPanel from "./_components/ReferralCandidatesPanel";
import TeamListPanel from "./_components/TeamListPanel";
import { apiFetch, getDashboardApiBaseUrl, getToken } from "@/app/_lib/api";
import { startSmartPolling } from "@/app/_lib/polling";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";

type UserItem = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  commissionPercent?: number | null;
  canRegisterHbxSellers?: boolean | null;
  sellerReferralCommissionPercent?: number | null;
  referredByUserId?: number | null;
  referredByCommissionPercentSnapshot?: number | null;
  referredByUser?: {
    id: number;
    username?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  role: string;
  isSystemMaster?: boolean | null;
  isActive: boolean;
  deactivatedAt?: string | null;
  retentionUntil?: string | null;
  createdAt: string;
};

type HbxPartnerReferralCandidate = {
  id: string;
  companyId: number;
  referrerUserId: number;
  name: string;
  phone: string;
  note?: string | null;
  preferredSegmentsJson?: string | null;
  status: "pending" | "approved" | "rejected" | "converted" | string;
  reviewedByUserId?: number | null;
  reviewedAt?: string | null;
  convertedUserId?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  referrerUser?: {
    id: number;
    username?: string | null;
    name?: string | null;
    email?: string | null;
    commissionPercent?: number | null;
    sellerReferralCommissionPercent?: number | null;
  } | null;
  convertedUser?: {
    id: number;
    username?: string | null;
    name?: string | null;
    email?: string | null;
    isActive?: boolean | null;
  } | null;
};

type MessageItem = {
  id: number;
  direction: string;
  body: string;
  status: string;
  timestamp: string;
  conversation?: { id: number; contact: string; channel: string };
  isComplaint?: boolean;
};

type SurveyItem = {
  id: string;
  rating?: number | null;
  feedback?: string | null;
  createdAt: string;
  customerPhone?: string | null;
  customerName?: string | null;
};

type OperationChecklistItem = {
  key: string;
  title: string;
  status: "ok" | "warning" | "blocked";
  value: string;
  hint: string;
};

type OperationAudit = {
  updatedAt: string;
  readinessScore: number;
  status: "ready" | "attention" | "setup";
  team: {
    activeSellers: number;
    activeAdmins: number;
    usermasters: number;
    configuredSellers: number;
    referralEnabledSellers: number;
  };
  pipeline: {
    totalCards: number;
    assignedCards: number;
    unassignedCards: number;
    newCards: number;
    contactedCards: number;
    activePipeline: number;
    dueReturns: number;
    wonClients: number;
    pendingActivation: number;
    inactiveClients: number;
  };
  finance: {
    payableAmount: number;
    duePayableAmount: number;
    pendingAmount: number;
    inheritedAmount: number;
    payrollRows: number;
  };
  checklist: OperationChecklistItem[];
  nextActions: Array<{ key: string; title: string; hint: string }>;
};

type GerencialOverview = {
  companyId: number;
  currentUser?: {
    id?: number | null;
    role?: string | null;
    isSystemMaster?: boolean | null;
    canManageCommissionSettings?: boolean | null;
  } | null;
  company?: {
    id: number;
    name?: string | null;
    isHbxSellerNetwork?: boolean | null;
  } | null;
  totals: {
    conversations: number;
    messages: number;
    inbound: number;
    outbound: number;
    complaints?: number;
    users: number;
    surveys: number;
  };
  users: UserItem[];
  commission?: CommissionOverview;
  operationAudit?: OperationAudit;
  recentMessages: MessageItem[];
  surveys: SurveyItem[];
};

type CommissionClient = {
  leadId: string;
  userId?: number | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  segment?: string | null;
  saleStatus?: string | null;
  salePlanKey?: string | null;
  commissionStatus?: string | null;
  saleValue?: number | null;
  commissionAmount?: number | null;
  commissionDueAt?: string | null;
  commissionPaidAt?: string | null;
  commissionNote?: string | null;
  commissionLinkedCompanyId?: number | null;
  commissionLinkedAt?: string | null;
  commissionAutoSyncedAt?: string | null;
  commissionSyncSource?: string | null;
  commissionPayoutId?: string | null;
  recurringCycleKey?: string | null;
  commissionKind?: string | null;
  isRecurring?: boolean | null;
  isInherited?: boolean | null;
  updatedAt?: string | null;
};

type CommissionPayout = {
  id: string;
  sellerUserId?: number | null;
  sellerName?: string | null;
  status?: string | null;
  leadCount: number;
  totalAmount: number;
  referenceLabel?: string | null;
  notes?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
  createdByUserId?: number | null;
};

type CommissionSellerSummary = {
  userId: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
  commissionPercent: number;
  assignedCards: number;
  activeClients: number;
  pendingActivation: number;
  inactiveClients: number;
  payableAmount: number;
  duePayableAmount: number;
  duePayableCount: number;
  pendingAmount: number;
  paidAmount: number;
  recurringAmount: number;
  inheritedAmount?: number;
  inheritedCount?: number;
  nextDueAt?: string | null;
  clients?: CommissionClient[];
};

type CommissionPayrollRow = {
  sellerUserId: number;
  sellerName: string;
  sellerEmail?: string | null;
  sellerPhone?: string | null;
  isActive: boolean;
  commissionPercent: number;
  duePayableAmount: number;
  duePayableCount: number;
  payableAmount: number;
  pendingAmount: number;
  recurringAmount: number;
  inheritedAmount?: number;
  inheritedCount?: number;
  activeClients: number;
  pendingActivation: number;
  inactiveClients: number;
  assignedCards: number;
  nextDueAt?: string | null;
  status: "due" | "payable" | "pending";
};

type CommissionOverview = {
  settings?: {
    dueBusinessDays?: number | null;
  };
  totals: {
    sellers: number;
    activeClients: number;
    pendingActivation: number;
    inactiveClients: number;
    payableAmount: number;
    duePayableAmount: number;
    duePayableCount: number;
    pendingAmount: number;
    paidAmount: number;
    recurringAmount: number;
    inheritedAmount?: number;
    inheritedCount?: number;
    nextDueAt?: string | null;
  };
  sellers: CommissionSellerSummary[];
  recentClients: CommissionClient[];
  activationQueue?: CommissionClient[];
  payroll?: CommissionPayrollRow[];
  payouts?: CommissionPayout[];
};

type CreateCompanyUserResult = {
  user: {
    id: number;
    email?: string | null;
    username?: string | null;
    name?: string | null;
    phone?: string | null;
    commissionPercent?: number | null;
    canRegisterHbxSellers?: boolean | null;
    sellerReferralCommissionPercent?: number | null;
    referredByUserId?: number | null;
    referredByCommissionPercentSnapshot?: number | null;
    referredByUser?: UserItem["referredByUser"];
    role: string;
    isSystemMaster?: boolean | null;
    isActive: boolean;
  };
  temporaryPassword?: string | null;
};

type SellerOnboardingAttachment = {
  id: string;
  kind: "photo_id" | "curriculum" | "contract_pdf" | "generated_contract" | "other" | string;
  originalFilename: string;
  required?: boolean | null;
  status?: string | null;
  createdAt?: string | null;
};

type PendingOnboardingAttachment = {
  kind: SellerOnboardingAttachment["kind"];
  file: File;
  required: boolean;
};

type SellerOnboardingDraftPayload = {
  id?: string | number;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  cpf?: string | null;
  declaredAddress?: string | null;
  commissionPercent?: number | null;
  commissionDueBusinessDays?: number | null;
  sellerReferralCommissionPercent?: number | null;
  referredByUserId?: number | null;
  referredByCommissionPercentSnapshot?: number | null;
};

type SellerOnboardingReadiness = {
  complete: boolean;
  documents: Array<{
    kind: SellerOnboardingAttachment["kind"];
    label: string;
    required: boolean;
    present: boolean;
  }>;
  receivedDocuments: Array<{ kind: SellerOnboardingAttachment["kind"]; label: string; required: boolean; present: boolean }>;
  missingRequiredDocuments: Array<{ kind: SellerOnboardingAttachment["kind"]; label: string; required: boolean; present: boolean }>;
};

type HbxReferralCandidatesResult = {
  candidates: HbxPartnerReferralCandidate[];
};

type HbxReferralCandidateReviewResult = {
  candidate: HbxPartnerReferralCandidate;
  user?: UserItem;
};

type HbxReferralCandidateLookupResult = {
  found: boolean;
  candidate?: HbxPartnerReferralCandidate | null;
  referrer?: HbxPartnerReferralCandidate["referrerUser"] | null;
};

type ModulePermission = { key: string; allowed: boolean };
type CompanyModule = { key: string; name: string; companyEnabled: boolean };
type CompanyUserAccess = { id: number; modules: ModulePermission[] };
type CompanyAccessPayload = { modules: CompanyModule[]; users: CompanyUserAccess[] };

type CreatedPasswordInfo = {
  userLabel: string;
  password: string;
};

type UserProfileDraft = {
  name: string;
  phone: string;
  commissionPercent: string;
  canRegisterHbxSellers: boolean;
  sellerReferralCommissionPercent: string;
  referredByUserId: string;
  referredByCommissionPercentSnapshot: string;
};

type GerencialRole = "USER" | "ADMIN" | "USERMASTER";
type MobileGerencialTab = "status" | "equipe" | "comissoes" | "modulos" | "sinais";
type DesktopGerencialGuideTab = MobileGerencialTab | "atualizar";

const CREATED_PASSWORD_STORAGE_KEY = "hbx.gerencial.created-password.v1";
const INCLUDED_TEAM_USERS = 2;
const EXTRA_USER_MONTHLY_PRICE = 24.9;
const SELLER_LOCKED_MODULE_KEYS = new Set(["webscraping", "gerencial", "financeiro", "cadastro", "website", "master", "exclusoes"]);
const HBX_SELLER_OPERATIONAL_MODULE_KEYS = new Set(["vendas", "webscraping"]);
const SELLER_WORKSPACE_MODULE_KEYS = new Set(["vendas", "atendimento", "whatsapp"]);
const SELLER_ROLE_COPY = {
  USER: {
    label: "Vendedor",
    badge: "CRM",
    description: "Recebe oportunidades, trabalha no CRM e chama no WhatsApp. Sem gestão.",
  },
  ADMIN: {
    label: "Admin",
    badge: "Controle",
    description: "Gerencia equipe, módulos, Radar, plano e distribuição de oportunidades.",
  },
  USERMASTER: {
    label: "USERMASTER",
    badge: "Master",
    description: "Conta HBX de comando global. Não entra na cobrança de assentos e não é vendedor.",
  },
} as const;
type UserFilter = "active" | "sellers" | "admins" | "inactive" | "all";

function normalizeRole(role?: string | null, isSystemMaster?: boolean | null): GerencialRole {
  const normalized = String(role || "").toUpperCase();
  if (isSystemMaster || normalized === "USERMASTER") return "USERMASTER";
  return normalized === "ADMIN" ? "ADMIN" : "USER";
}

function normalizeModuleKey(key?: string | null) {
  return String(key || "").trim().toLowerCase();
}

function roleLabel(role?: string | null, isSystemMaster?: boolean | null) {
  return SELLER_ROLE_COPY[normalizeRole(role, isSystemMaster)].label;
}

function roleDescription(role?: string | null, isSystemMaster?: boolean | null) {
  return SELLER_ROLE_COPY[normalizeRole(role, isSystemMaster)].description;
}

function moduleLabel(module: Pick<CompanyModule, "key" | "name">) {
  const key = normalizeModuleKey(module.key);
  if (key === "webscraping") return "Radar";
  if (key === "cadastro") return "Clientes";
  return module.name || module.key;
}

function userLabel(user: Pick<UserItem, "id" | "name" | "username" | "email">) {
  return user.name || user.username || user.email || `Usuário #${user.id}`;
}

function userInitial(user: Pick<UserItem, "id" | "name" | "username" | "email">) {
  return userLabel(user).trim().charAt(0).toUpperCase() || "U";
}

function userPhoneLabel(user: Pick<UserItem, "phone">) {
  return user.phone?.trim() || "Sem telefone";
}

function phoneDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function referralUserLabel(user?: UserItem["referredByUser"]) {
  if (!user) return "Direto HBX";
  return user.name || user.username || user.email || `Vendedor #${user.id}`;
}

function candidatePreferredSegmentsLabel(candidate: HbxPartnerReferralCandidate) {
  const raw = String(candidate.preferredSegmentsJson || "").trim();
  if (!raw) return "-";
  try {
    const parsed = JSON.parse(raw) as { segments?: string[]; cityRegion?: string | null };
    const segments = Array.isArray(parsed.segments) ? parsed.segments.filter(Boolean) : [];
    const parts = [...segments, parsed.cityRegion || ""].filter(Boolean);
    return parts.length ? parts.join(" · ") : "-";
  } catch {
    return raw;
  }
}

function buildProfileDraft(user: UserItem): UserProfileDraft {
  return {
    name: user.name || "",
    phone: user.phone || "",
    commissionPercent: Number(user.commissionPercent || 0).toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
    }),
    canRegisterHbxSellers: Boolean(user.canRegisterHbxSellers),
    sellerReferralCommissionPercent: Number(user.sellerReferralCommissionPercent || 0).toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
    }),
    referredByUserId: user.referredByUserId ? String(user.referredByUserId) : "",
    referredByCommissionPercentSnapshot: Number(user.referredByCommissionPercentSnapshot || 0).toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
    }),
  };
}

function parsePercentInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return 0;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(100, Math.max(0, Math.round(numeric * 100) / 100));
}

function parseOptionalPercentInput(value: string) {
  if (!value.trim()) return undefined;
  return parsePercentInput(value);
}

function percentInputValue(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatPercent(value?: number | null) {
  const numeric = Number(value || 0);
  return `${numeric.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function saleStatusLabel(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "activation_pending") return "Aguardando ativação";
  if (normalized === "trial_started") return "Trial iniciado";
  if (normalized === "sale_confirmed") return "Ativo";
  if (normalized === "inactive") return "Inativo";
  if (normalized === "canceled") return "Cancelado";
  return "Sem venda";
}

function normalizeCommissionSaleStatus(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (["activation_pending", "trial_started", "sale_confirmed", "inactive", "canceled"].includes(normalized)) {
    return normalized;
  }
  return "none";
}

function salePlanLabel(planKey?: string | null) {
  const normalized = String(planKey || "").trim().toLowerCase();
  if (normalized === "hbx_lite") return "HBX List";
  if (normalized === "hbx_melhor") return "HBX Full";
  if (normalized === "hbx_padrao") return "HBX Lead Plus";
  return "Plano HBX";
}

function commissionStatusLabel(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "pending") return "Pendente";
  if (normalized === "payable") return "A pagar";
  if (normalized === "paid") return "Pago";
  if (normalized === "canceled") return "Cancelado";
  return "Sem comissão";
}

function commissionClientSourceLabel(client: CommissionClient) {
  if (client.isInherited) {
    return client.isRecurring
      ? `Herdada recorrente ${client.recurringCycleKey || ""}`.trim()
      : "Herdada inicial";
  }
  if (client.isRecurring) return `Recorrente ${client.recurringCycleKey || ""}`.trim();
  return commissionActivationStageLabel(client);
}

function commissionActivationStageLabel(client: CommissionClient) {
  const saleStatus = normalizeCommissionSaleStatus(client.saleStatus);
  const syncSource = String(client.commissionSyncSource || "").toLowerCase();
  if (saleStatus === "activation_pending") {
    if (syncSource.includes("auth_email_confirmed")) return "E-mail confirmado";
    if (client.commissionLinkedCompanyId) return "E-mail pendente";
    return "Link enviado";
  }
  return saleStatusLabel(client.saleStatus);
}

function commissionActivationHint(client: CommissionClient, dueBusinessDays = 3) {
  const saleStatus = normalizeCommissionSaleStatus(client.saleStatus);
  const syncSource = String(client.commissionSyncSource || "").toLowerCase();
  if (saleStatus === "activation_pending") {
    if (syncSource.includes("auth_email_confirmed")) {
      return "Cliente comprovou o e-mail. Avance para trial ou pagamento quando a implantação começar.";
    }
    if (client.commissionLinkedCompanyId) {
      return "Cadastro HBX criado. Falta o cliente confirmar o e-mail para liberar implantação.";
    }
    return "Link rastreado foi gerado. Falta o cliente concluir o cadastro HBX.";
  }
  if (saleStatus === "trial_started") return `Trial ativo. Comissão entra na folha em D+${dueBusinessDays}.`;
  if (saleStatus === "sale_confirmed") return `Pagamento confirmado. Comissão recorrente em D+${dueBusinessDays}.`;
  if (saleStatus === "inactive" || saleStatus === "canceled") return "Cliente inativado ou cancelado. Comissão não fica liberada.";
  return "Sem etapa HBX vinculada.";
}

function commissionActivationBadgeClass(client: CommissionClient) {
  const saleStatus = normalizeCommissionSaleStatus(client.saleStatus);
  const syncSource = String(client.commissionSyncSource || "").toLowerCase();
  if (saleStatus === "activation_pending" && syncSource.includes("auth_email_confirmed")) return "badge badge-success";
  if (saleStatus === "activation_pending" && client.commissionLinkedCompanyId) return "badge badge-brand";
  if (saleStatus === "activation_pending") return "badge";
  if (saleStatus === "trial_started" || saleStatus === "sale_confirmed") return "badge badge-success";
  if (saleStatus === "inactive" || saleStatus === "canceled") return "badge badge-danger";
  return "badge";
}

function formatShortDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function onboardingAttachmentLabel(kind?: string | null) {
  if (kind === "photo_id") return "Documento";
  if (kind === "curriculum") return "Currículo";
  if (kind === "contract_pdf") return "Contrato assinado";
  if (kind === "generated_contract") return "Contrato PDF gerado";
  return "Outro";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function payrollStatusLabel(status?: CommissionPayrollRow["status"] | null) {
  if (status === "due") return "Liberado";
  if (status === "payable") return "Aguardando prazo";
  return "Em desenvolvimento";
}

function normalizeCommissionDueBusinessDays(value?: number | string | null) {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) return 3;
  return Math.min(30, Math.max(0, numeric));
}

function operationStatusLabel(status?: OperationAudit["status"] | null) {
  if (status === "ready") return "Pronto";
  if (status === "attention") return "Atenção";
  return "Configurar";
}

function checklistBadgeClass(status?: OperationChecklistItem["status"] | null) {
  if (status === "ok") return "badge badge-success";
  if (status === "warning") return "badge badge-brand";
  return "badge badge-danger";
}

function checklistStatusLabel(status?: OperationChecklistItem["status"] | null) {
  if (status === "ok") return "OK";
  if (status === "warning") return "Ajustar";
  return "Pendente";
}

function buildPayrollSummaryText(rows: CommissionPayrollRow[], generatedAt = new Date()) {
  const payableRows = rows.filter((row) => row.duePayableAmount > 0 || row.payableAmount > 0);
  const totalDue = payableRows.reduce((sum, row) => sum + Number(row.duePayableAmount || 0), 0);
  const totalPayable = payableRows.reduce((sum, row) => sum + Number(row.payableAmount || 0), 0);
  const lines = [
    `Folha de comissões HBX - ${generatedAt.toLocaleDateString("pt-BR")}`,
    `Total liberado: ${formatCurrency(totalDue)}`,
    `Total a pagar: ${formatCurrency(totalPayable)}`,
    "",
    ...payableRows.map((row) => [
      `${row.sellerName} (${payrollStatusLabel(row.status)})`,
      `Liberado: ${formatCurrency(row.duePayableAmount || 0)}`,
      `A pagar: ${formatCurrency(row.payableAmount || 0)}`,
      `Herdada: ${formatCurrency(row.inheritedAmount || 0)}`,
      `Clientes ativos: ${row.activeClients}`,
    ].join(" | ")),
  ];
  return lines.filter(Boolean).join("\n");
}

function stableUserOrder(previous: UserItem[] | undefined, next: UserItem[]) {
  if (!previous?.length) return next;
  const nextById = new Map(next.map((user) => [user.id, user]));
  const ordered = previous
    .map((user) => nextById.get(user.id))
    .filter((user): user is UserItem => Boolean(user));
  const knownIds = new Set(ordered.map((user) => user.id));
  const appended = next.filter((user) => !knownIds.has(user.id));
  return [...ordered, ...appended];
}

async function loadReferralCandidatesIfHbxNetwork(payload: GerencialOverview) {
  if (!payload.company?.isHbxSellerNetwork) return [];

  try {
    const candidatesPayload = await apiFetch<HbxReferralCandidatesResult>("/gerencial/hbx-partner-referrals/pending");
    return candidatesPayload.candidates || [];
  } catch (referralError) {
    console.warn("[HBX gerencial] Falha ao carregar indicacoes HBX.", referralError);
    return [];
  }
}

function friendlyGerencialError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : fallback;
  const message = String(raw || "").trim();
  const lower = message.toLowerCase();
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 0;

  if (lower.includes("e-mail já cadastrado") || lower.includes("email já cadastrado")) {
    return "Este e-mail já está cadastrado. Use outro e-mail ou confira se o usuário já existe na lista.";
  }
  if (lower.includes("username já cadastrado")) {
    return "Este login já está cadastrado. Nesta tela o login segue o e-mail informado.";
  }
  if (lower.includes("free trial") || lower.includes("máximo 2 usuários")) {
    return "O limite do trial foi atingido: a empresa pode ter no máximo 2 usuários ativos durante o período gratuito.";
  }
  if (lower.includes("senha fraca") || lower.includes("password must be longer") || lower.includes("mínimo 8")) {
    return "Senha fraca. Use no mínimo 8 caracteres ou deixe em branco para o HBX gerar uma senha temporária.";
  }
  if (status === 401 || status === 403 || lower.includes("forbidden") || lower.includes("sem permissão")) {
    return "Sem permissão para gerenciar usuários. Apenas ADMIN da empresa pode criar, ativar ou alterar perfis.";
  }
  return message || fallback;
}

function loadCreatedPasswordInfo(): CreatedPasswordInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CREATED_PASSWORD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CreatedPasswordInfo;
    if (!parsed?.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCreatedPasswordInfo(info: CreatedPasswordInfo | null) {
  if (typeof window === "undefined") return;
  if (!info) {
    window.localStorage.removeItem(CREATED_PASSWORD_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(CREATED_PASSWORD_STORAGE_KEY, JSON.stringify(info));
}

export default function GerencialClientPage({ mobileRoute = false }: { mobileRoute?: boolean } = {}) {
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GerencialOverview | null>(null);
  const [changingUserId, setChangingUserId] = useState<number | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserCommissionPercent, setNewUserCommissionPercent] = useState("");
  const [newUserCanRegisterHbxSellers, setNewUserCanRegisterHbxSellers] = useState(false);
  const [newUserSellerReferralCommissionPercent, setNewUserSellerReferralCommissionPercent] = useState("");
  const [newUserReferredByUserId, setNewUserReferredByUserId] = useState("");
  const [newUserReferredByCommissionPercent, setNewUserReferredByCommissionPercent] = useState("");
  const [newUserRole, setNewUserRole] = useState<"USER" | "ADMIN">("USER");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserCpf, setNewUserCpf] = useState("");
  const [newUserDeclaredAddress, setNewUserDeclaredAddress] = useState("");
  const [newUserCommissionDueBusinessDays, setNewUserCommissionDueBusinessDays] = useState("3");
  const [createdPasswordInfo, setCreatedPasswordInfo] = useState<CreatedPasswordInfo | null>(() =>
    loadCreatedPasswordInfo(),
  );
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [togglingMessageId, setTogglingMessageId] = useState<number | null>(null);
  const [moduleAccess, setModuleAccess] = useState<CompanyAccessPayload | null>(null);
  const [referralCandidates, setReferralCandidates] = useState<HbxPartnerReferralCandidate[]>([]);
  const [reviewingCandidateId, setReviewingCandidateId] = useState<string | null>(null);
  const [createAccessOpen, setCreateAccessOpen] = useState(false);
  const [newUserReferralCandidateId, setNewUserReferralCandidateId] = useState("");
  const [referralPhoneMatch, setReferralPhoneMatch] = useState<HbxPartnerReferralCandidate | null>(null);
  const [ignoredReferralCandidateId, setIgnoredReferralCandidateId] = useState("");
  const [onboardingUserId, setOnboardingUserId] = useState<number | null>(null);
  const [onboardingAttachments, setOnboardingAttachments] = useState<SellerOnboardingAttachment[]>([]);
  const [onboardingReadiness, setOnboardingReadiness] = useState<SellerOnboardingReadiness | null>(null);
  const [pendingOnboardingAttachments, setPendingOnboardingAttachments] = useState<Record<string, PendingOnboardingAttachment>>({});
  const [pendingDocumentRequirements, setPendingDocumentRequirements] = useState<Record<string, boolean>>({});
  const [onboardingStatusMessage, setOnboardingStatusMessage] = useState<string | null>(null);
  const [uploadingAttachmentKind, setUploadingAttachmentKind] = useState<string | null>(null);
  const [removingOnboardingAttachmentId, setRemovingOnboardingAttachmentId] = useState<string | null>(null);
  const [downloadingOnboardingAttachmentId, setDownloadingOnboardingAttachmentId] = useState<string | null>(null);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [sendingOnboardingEmail, setSendingOnboardingEmail] = useState(false);
  const [savingModuleUserId, setSavingModuleUserId] = useState<number | null>(null);
  const [togglingActiveUserId, setTogglingActiveUserId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [markingCommissionLeadId, setMarkingCommissionLeadId] = useState<string | null>(null);
  const [updatingActivationLeadId, setUpdatingActivationLeadId] = useState<string | null>(null);
  const [syncingCommissions, setSyncingCommissions] = useState(false);
  const [closingCommissionScope, setClosingCommissionScope] = useState<string | null>(null);
  const [commissionDueDaysDraft, setCommissionDueDaysDraft] = useState("3");
  const [savingCommissionSettings, setSavingCommissionSettings] = useState(false);
  const [userFilter, setUserFilter] = useState<UserFilter>("active");
  const [userSearch, setUserSearch] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileGerencialTab>("status");
  const [desktopGuideTab, setDesktopGuideTab] = useState<DesktopGerencialGuideTab>("status");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [savingProfileUserId, setSavingProfileUserId] = useState<number | null>(null);
  const [profileDraft, setProfileDraft] = useState<UserProfileDraft>({
    name: "",
    phone: "",
    commissionPercent: "0",
    canRegisterHbxSellers: false,
    sellerReferralCommissionPercent: "0",
    referredByUserId: "",
    referredByCommissionPercentSnapshot: "0",
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [payload, access] = await Promise.all([
        apiFetch<GerencialOverview>("/gerencial/overview"),
        apiFetch<CompanyAccessPayload>("/modules/company/access"),
      ]);
      const referralCandidatesPayload = await loadReferralCandidatesIfHbxNetwork(payload);
      setData((prev) => ({
        ...payload,
        users: stableUserOrder(prev?.users, payload.users || []),
      }));
      setModuleAccess(access);
      setReferralCandidates(referralCandidatesPayload);
    } catch (loadError) {
      setError(friendlyGerencialError(loadError, "Falha ao carregar módulo gerencial."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken !== true) return;
    setLoading(true);
    return startSmartPolling(load, { intervalMs: 15000, immediate: true });
  }, [hasToken, load]);

  const isHbxSellerNetwork = Boolean(data?.company?.isHbxSellerNetwork);
  const canCreateAdminUsers = !isHbxSellerNetwork;
  const canManageCommissionSettings = Boolean(data?.currentUser?.canManageCommissionSettings);
  const commissionDueDays = normalizeCommissionDueBusinessDays(data?.commission?.settings?.dueBusinessDays);

  useEffect(() => {
    if (savingCommissionSettings) return;
    setCommissionDueDaysDraft(String(commissionDueDays));
  }, [commissionDueDays, savingCommissionSettings]);

  useEffect(() => {
    if (!isHbxSellerNetwork || newUserRole !== "USER") {
      setReferralPhoneMatch(null);
      return;
    }
    const digits = phoneDigits(newUserPhone);
    if (digits.length < 8 || newUserReferralCandidateId) {
      setReferralPhoneMatch(null);
      return;
    }
    const localMatch = referralCandidates.find((candidate) => {
      return phoneDigits(candidate.phone) === digits && candidate.id !== ignoredReferralCandidateId;
    });
    if (localMatch) {
      setReferralPhoneMatch(localMatch);
      return;
    }
    const timeout = window.setTimeout(() => {
      apiFetch<HbxReferralCandidateLookupResult>(`/gerencial/hbx-partner-referrals/lookup-phone?phone=${encodeURIComponent(newUserPhone)}`)
        .then((payload) => {
          const candidate = payload?.candidate || null;
          setReferralPhoneMatch(candidate && candidate.id !== ignoredReferralCandidateId ? candidate : null);
        })
        .catch(() => setReferralPhoneMatch(null));
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [ignoredReferralCandidateId, isHbxSellerNetwork, newUserPhone, newUserReferralCandidateId, newUserRole, referralCandidates]);

  useEffect(() => {
    if (isHbxSellerNetwork && newUserRole !== "USER") {
      setNewUserRole("USER");
    }
  }, [isHbxSellerNetwork, newUserRole]);

  async function setRole(userId: number, role: "USER" | "ADMIN") {
    setChangingUserId(userId);
    setError(null);
    try {
      await apiFetch(`/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      // Update local state in-place so the user stays in the same position
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  role,
                  ...(role === "ADMIN"
                    ? {
                        canRegisterHbxSellers: false,
                        sellerReferralCommissionPercent: 0,
                        referredByUserId: null,
                        referredByCommissionPercentSnapshot: 0,
                        referredByUser: null,
                      }
                    : {}),
                }
              : u,
          ),
        };
      });

      // Adjust moduleAccess locally so ADMIN shows all modules active,
      // and USER falls back to company default for visibility without reordering.
      setModuleAccess((prev) => {
        if (!prev) return prev;
        const users = prev.users.map((u) => {
          if (u.id !== userId) return u;
          if (role === "ADMIN") {
            return { ...u, modules: u.modules.map((m) => ({ ...m, allowed: true })) };
          }
          return {
            ...u,
            modules: u.modules.map((m) => {
              const companyMod = prev.modules.find((cm) => cm.key === m.key);
              const moduleKey = normalizeModuleKey(m.key);
              const hbxSellerOperationalModule = isHbxSellerNetwork && HBX_SELLER_OPERATIONAL_MODULE_KEYS.has(moduleKey);
              return {
                ...m,
                allowed: hbxSellerOperationalModule
                  ? true
                  : SELLER_LOCKED_MODULE_KEYS.has(moduleKey)
                  ? false
                  : companyMod
                    ? Boolean(companyMod.companyEnabled)
                    : m.allowed,
              };
            }),
          };
        });
        return { ...prev, users };
      });
    } catch (roleError) {
      setError(friendlyGerencialError(roleError, "Falha ao atualizar perfil."));
    } finally {
      setChangingUserId(null);
    }
  }

  async function toggleActive(userId: number, active: boolean) {
    setTogglingActiveUserId(userId);
    setError(null);
    setActionInfo(null);
    try {
      const payload = await apiFetch<{ message?: string; isActive: boolean; deactivatedAt?: string | null; retentionUntil?: string | null }>(`/users/${userId}/active`, {
        method: "PATCH",
        body: JSON.stringify({ active: !active }),
      });

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  isActive: Boolean(payload?.isActive),
                  deactivatedAt: payload?.deactivatedAt ?? null,
                  retentionUntil: payload?.retentionUntil ?? null,
                }
              : u,
          ),
        };
      });

      setActionInfo(
        payload?.message ||
          "Usuário desativado com sucesso, manteremos histórico por 730 dias.",
      );
    } catch (activeError) {
      setError(friendlyGerencialError(activeError, "Falha ao atualizar status do usuário."));
    } finally {
      setTogglingActiveUserId(null);
    }
  }

  async function deleteUser(user: UserItem) {
    const label = userLabel(user);
    if (!window.confirm(`Excluir definitivamente ${label}? Esta ação remove o usuário da equipe e limpa os vínculos dele.`)) {
      return;
    }

    setDeletingUserId(user.id);
    setError(null);
    setActionInfo(null);
    try {
      const payload = await apiFetch<{ ok?: boolean; id?: number; message?: string }>(`/users/${user.id}/delete`, {
        method: "DELETE",
      });

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.filter((item) => item.id !== user.id),
        };
      });
      setModuleAccess((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.filter((item) => item.id !== user.id),
        };
      });
      setEditingUserId((current) => (current === user.id ? null : current));
      setActionInfo(payload?.message || "Usuário excluído definitivamente.");
    } catch (deleteError) {
      setError(friendlyGerencialError(deleteError, "Falha ao excluir usuário."));
    } finally {
      setDeletingUserId(null);
    }
  }

  async function reviewReferralCandidate(candidate: HbxPartnerReferralCandidate, action: "approve" | "reject") {
    const label = candidate.name || candidate.phone || "indicação";
    if (action === "reject" && !window.confirm(`Rejeitar indicação de ${label}?`)) return;
    setReviewingCandidateId(candidate.id);
    setError(null);
    setActionInfo(null);
    try {
      await apiFetch<HbxReferralCandidateReviewResult>(`/gerencial/hbx-partner-referrals/${candidate.id}/${action}`, {
        method: "POST",
      });
      setActionInfo(action === "approve"
        ? `${label} foi aprovado. A indicação continua guardada para cadastro formal.`
        : `${label} foi rejeitado.`);
      await load();
    } catch (reviewError) {
      setError(friendlyGerencialError(reviewError, action === "approve" ? "Falha ao aprovar indicação." : "Falha ao rejeitar indicação."));
    } finally {
      setReviewingCandidateId(null);
    }
  }

  function applyReferralCandidate(candidate: HbxPartnerReferralCandidate) {
    const referrer = candidate.referrerUser || hbxReferrers.find((item) => item.id === candidate.referrerUserId) || null;
    setNewUserRole("USER");
    setNewUserReferralCandidateId(candidate.id);
    setReferralPhoneMatch(null);
    setIgnoredReferralCandidateId("");
    setNewUserName(candidate.name || "");
    setNewUserPhone(candidate.phone || "");
    setNewUserReferredByUserId(String(candidate.referrerUserId || ""));
    if (referrer) {
      setNewUserCommissionPercent(percentInputValue(referrer.commissionPercent));
      setNewUserSellerReferralCommissionPercent(percentInputValue(referrer.sellerReferralCommissionPercent));
      setNewUserReferredByCommissionPercent(percentInputValue(referrer.sellerReferralCommissionPercent));
    }
    setActionInfo(`Cadastro carregado pela indicação de ${referrer ? userLabel(referrer) : `#${candidate.referrerUserId}`}. Complete e-mail, CPF, documentos e contrato.`);
    setCreateAccessOpen(true);
    if (mobileRoute) setMobileTab("equipe");
    setDesktopGuideTab("equipe");
  }

  async function loadOnboardingAttachments(userId: number) {
    const payload = await apiFetch<{ attachments?: SellerOnboardingAttachment[]; readiness?: SellerOnboardingReadiness }>(`/gerencial/hbx-partners/${userId}/onboarding/attachments`);
    setOnboardingAttachments(payload.attachments || []);
    setOnboardingReadiness(payload.readiness || null);
  }

  async function openSellerCadastroPopup(user: UserItem) {
    resetCreateAccessPopup();
    setNewUserRole("USER");
    setNewUserEmail((user.email || user.username || "").trim().toLowerCase());
    setNewUserName(user.name || "");
    setNewUserPhone(user.phone || "");
    setNewUserCommissionPercent(percentInputValue(user.commissionPercent));
    setNewUserSellerReferralCommissionPercent(percentInputValue(user.sellerReferralCommissionPercent));
    setNewUserReferredByUserId(user.referredByUserId ? String(user.referredByUserId) : "");
    setNewUserReferredByCommissionPercent(percentInputValue(user.referredByCommissionPercentSnapshot));
    setNewUserPassword("");
    setOnboardingUserId(user.id);
    setCreateAccessOpen(true);
    setError(null);
    setActionInfo(null);
    try {
      const onboarding = await apiFetch<SellerOnboardingDraftPayload>(`/gerencial/hbx-partners/${user.id}/onboarding`);
      setNewUserName(onboarding.legalName || user.name || "");
      setNewUserPhone(onboarding.phone || user.phone || "");
      setNewUserCpf(onboarding.cpf || "");
      setNewUserDeclaredAddress(onboarding.declaredAddress || "");
      setNewUserCommissionDueBusinessDays(String(onboarding.commissionDueBusinessDays || 3));
      setNewUserCommissionPercent(percentInputValue(onboarding.commissionPercent ?? user.commissionPercent));
      setNewUserSellerReferralCommissionPercent(percentInputValue(onboarding.sellerReferralCommissionPercent ?? user.sellerReferralCommissionPercent));
      setNewUserReferredByUserId(onboarding.referredByUserId ? String(onboarding.referredByUserId) : user.referredByUserId ? String(user.referredByUserId) : "");
      setNewUserReferredByCommissionPercent(percentInputValue(onboarding.referredByCommissionPercentSnapshot ?? user.referredByCommissionPercentSnapshot));
      await loadOnboardingAttachments(user.id);
    } catch (openError) {
      setError(friendlyGerencialError(openError, "Falha ao abrir cadastro do vendedor."));
      await loadOnboardingAttachments(user.id).catch(() => null);
    }
  }

  function validateOnboardingFile(file: File, kind?: SellerOnboardingAttachment["kind"]) {
    const extension = `.${(file.name.split(".").pop() || "").toLowerCase()}`;
    if (kind === "contract_pdf" && extension !== ".pdf") {
      return "Contrato assinado precisa ser PDF.";
    }
    if (![".pdf", ".jpg", ".jpeg", ".png"].includes(extension)) {
      return "Anexo precisa ser PDF, JPG ou PNG.";
    }
    if (file.size > 5 * 1024 * 1024) {
      return "Anexo deve ter no máximo 5MB.";
    }
    return null;
  }

  async function uploadOnboardingAttachmentForUser(userId: number, kind: SellerOnboardingAttachment["kind"], file: File, required: boolean) {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", String(kind));
    form.append("required", String(required));
    const payload = await apiFetch<{ readiness?: SellerOnboardingReadiness }>(`/gerencial/hbx-partners/${userId}/onboarding/attachments`, {
      method: "POST",
      body: form,
    });
    if (payload.readiness) setOnboardingReadiness(payload.readiness);
    return payload;
  }

  async function uploadOnboardingAttachment(kind: SellerOnboardingAttachment["kind"], file: File | null | undefined, required: boolean) {
    if (!file) return;
    const validationError = validateOnboardingFile(file, kind);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!onboardingUserId) {
      setPendingOnboardingAttachments((current) => ({
        ...current,
        [String(kind)]: { kind, file, required },
      }));
      setOnboardingStatusMessage(`${onboardingAttachmentLabel(kind)} separado. Ele será anexado automaticamente ao cadastrar o vendedor.`);
      return;
    }
    setUploadingAttachmentKind(String(kind));
    setError(null);
    try {
      await uploadOnboardingAttachmentForUser(onboardingUserId, kind, file, required);
      await loadOnboardingAttachments(onboardingUserId);
    } catch (uploadError) {
      setError(friendlyGerencialError(uploadError, "Falha ao anexar documento."));
    } finally {
      setUploadingAttachmentKind(null);
    }
  }

  async function generateOnboardingContract() {
    if (!onboardingUserId) return;
    setGeneratingContract(true);
    setError(null);
    try {
      const payload = await apiFetch<{ attachments?: SellerOnboardingAttachment[]; readiness?: SellerOnboardingReadiness }>(`/gerencial/hbx-partners/${onboardingUserId}/onboarding/generate-contract`, { method: "POST" });
      if (payload.attachments) setOnboardingAttachments(payload.attachments);
      if (payload.readiness) setOnboardingReadiness(payload.readiness);
      await loadOnboardingAttachments(onboardingUserId);
      setOnboardingStatusMessage("Contrato PDF gerado e anexado ao cadastro.");
    } catch (contractError) {
      setError(friendlyGerencialError(contractError, "Falha ao gerar contrato."));
    } finally {
      setGeneratingContract(false);
    }
  }

  async function downloadOnboardingAttachment(attachment: SellerOnboardingAttachment | null | undefined) {
    if (!onboardingUserId || !attachment?.id) return;
    const token = getToken();
    if (!token) {
      setError("Sessão expirada. Faça login novamente.");
      return;
    }
    setDownloadingOnboardingAttachmentId(attachment.id);
    setError(null);
    try {
      const response = await fetch(
        `${getDashboardApiBaseUrl()}/gerencial/hbx-partners/${onboardingUserId}/onboarding/attachments/${attachment.id}/download`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || "Falha ao baixar arquivo.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.originalFilename || "contrato-parceria-hbx.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (downloadError) {
      setError(friendlyGerencialError(downloadError, "Falha ao baixar arquivo."));
    } finally {
      setDownloadingOnboardingAttachmentId(null);
    }
  }

  async function updateOnboardingDocumentRequirement(kind: SellerOnboardingAttachment["kind"], required: boolean) {
    if (!onboardingUserId) {
      setPendingDocumentRequirements((current) => ({ ...current, [String(kind)]: required }));
      setPendingOnboardingAttachments((current) => {
        const pending = current[String(kind)];
        if (!pending) return current;
        return { ...current, [String(kind)]: { ...pending, required } };
      });
      return;
    }
    setError(null);
    try {
      const payload = await apiFetch<{ readiness?: SellerOnboardingReadiness }>(`/gerencial/hbx-partners/${onboardingUserId}/onboarding/document-requirement`, {
        method: "PATCH",
        body: JSON.stringify({ kind, required }),
      });
      if (payload.readiness) setOnboardingReadiness(payload.readiness);
      await loadOnboardingAttachments(onboardingUserId);
    } catch (requirementError) {
      setError(friendlyGerencialError(requirementError, "Falha ao atualizar exigência do documento."));
    }
  }

  async function removeOnboardingAttachment(kind: SellerOnboardingAttachment["kind"], attachment?: SellerOnboardingAttachment | null) {
    const kindKey = String(kind);
    if (!attachment?.id) {
      setPendingOnboardingAttachments((current) => {
        const next = { ...current };
        delete next[kindKey];
        return next;
      });
      setOnboardingStatusMessage(`${onboardingAttachmentLabel(kind)} removido da fila de anexos.`);
      return;
    }
    if (!onboardingUserId) return;
    setRemovingOnboardingAttachmentId(String(attachment.id));
    setError(null);
    try {
      const payload = await apiFetch<{ attachments?: SellerOnboardingAttachment[]; readiness?: SellerOnboardingReadiness }>(`/gerencial/hbx-partners/${onboardingUserId}/onboarding/attachments/${attachment.id}`, {
        method: "DELETE",
      });
      setOnboardingAttachments(payload.attachments || []);
      if (payload.readiness) setOnboardingReadiness(payload.readiness);
      await loadOnboardingAttachments(onboardingUserId);
      setOnboardingStatusMessage(`${onboardingAttachmentLabel(kind)} removido.`);
    } catch (removeError) {
      setError(friendlyGerencialError(removeError, "Falha ao remover anexo."));
    } finally {
      setRemovingOnboardingAttachmentId(null);
    }
  }

  async function sendOnboardingEmail() {
    if (!onboardingUserId) return;
    setSendingOnboardingEmail(true);
    setError(null);
    try {
      const payload = await apiFetch<{ ok?: boolean; readiness?: SellerOnboardingReadiness }>(`/gerencial/hbx-partners/${onboardingUserId}/onboarding/send-email`, { method: "POST" });
      if (payload.readiness) setOnboardingReadiness(payload.readiness);
      setActionInfo(payload.ok ? "E-mail enviado com o contrato PDF. Login e senha só saem depois da aprovação." : "E-mail não enviado.");
      await load();
    } catch (emailError) {
      setError(friendlyGerencialError(emailError, "Falha ao enviar e-mail."));
    } finally {
      setSendingOnboardingEmail(false);
    }
  }

  async function activateOnboardingPartner() {
    if (!onboardingUserId) return;
    setTogglingActiveUserId(onboardingUserId);
    setError(null);
    setActionInfo(null);
    try {
      const payload = await apiFetch<{ message?: string; isActive: boolean }>(`/users/${onboardingUserId}/active`, {
        method: "PATCH",
        body: JSON.stringify({ active: true }),
      });
      setActionInfo(payload.message || "Parceiro criado e e-mail de boas-vindas enviado.");
      await load();
      resetCreateAccessPopup();
      setCreateAccessOpen(false);
    } catch (activateError) {
      setError(friendlyGerencialError(activateError, "Falha ao criar parceiro."));
      if (onboardingUserId) await loadOnboardingAttachments(onboardingUserId).catch(() => null);
    } finally {
      setTogglingActiveUserId(null);
    }
  }

  function resetCreateAccessPopup() {
    setNewUserEmail("");
    setNewUserName("");
    setNewUserPhone("");
    setNewUserCommissionPercent("");
    setNewUserCanRegisterHbxSellers(false);
    setNewUserSellerReferralCommissionPercent("");
    setNewUserReferredByUserId("");
    setNewUserReferredByCommissionPercent("");
    setNewUserRole("USER");
    setNewUserPassword("");
    setNewUserCpf("");
    setNewUserDeclaredAddress("");
    setNewUserCommissionDueBusinessDays("3");
    setNewUserReferralCandidateId("");
    setReferralPhoneMatch(null);
    setIgnoredReferralCandidateId("");
    setOnboardingUserId(null);
    setOnboardingAttachments([]);
    setOnboardingReadiness(null);
    setOnboardingStatusMessage(null);
    setPendingOnboardingAttachments({});
    setPendingDocumentRequirements({});
  }

  function renderReferralMatchBox(surface: "mobile" | "desktop") {
    const candidate = referralPhoneMatch;
    if (!candidate) {
      if (!newUserReferralCandidateId) return null;
      const selected = referralCandidates.find((item) => item.id === newUserReferralCandidateId);
      if (!selected) return null;
      return (
        <div className={surface === "mobile" ? "rounded-[16px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3 text-sm" : "rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-sm"}>
          <strong className="block">Cadastro puxado de indicação</strong>
          <span className={surface === "mobile" ? "text-[var(--hbx-mobile-muted)]" : "text-muted"}>
            Indicado por {selected.referrerUser ? userLabel(selected.referrerUser) : `#${selected.referrerUserId}`}. A conversão será feita ao cadastrar.
          </span>
        </div>
      );
    }
    return (
      <div className={surface === "mobile" ? "rounded-[16px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3 text-sm" : "rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-sm"}>
        <strong className="block">Telefone indicado por {candidate.referrerUser ? userLabel(candidate.referrerUser) : `#${candidate.referrerUserId}`}</strong>
        <span className={surface === "mobile" ? "text-[var(--hbx-mobile-muted)]" : "text-muted"}>
          Use a indicação para puxar nome, telefone, indicador e segmentos preferidos.
        </span>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => applyReferralCandidate(candidate)} className={surface === "mobile" ? "hbx-mobile-primary-button" : "btn btn-primary btn-sm"}>
            Usar
          </button>
          <button
            type="button"
            onClick={() => {
              setIgnoredReferralCandidateId(candidate.id);
              setReferralPhoneMatch(null);
            }}
            className={surface === "mobile" ? "hbx-mobile-secondary-button" : "btn btn-secondary btn-sm"}
          >
            Ignorar
          </button>
        </div>
      </div>
    );
  }

  async function toggleComplaint(messageId: number, currently: boolean | undefined) {
    setTogglingMessageId(messageId);
    setError(null);
    try {
      await apiFetch(`/gerencial/message/${messageId}/complaint`, {
        method: "PATCH",
        body: JSON.stringify({ isComplaint: !Boolean(currently) }),
      });
      await load();
    } catch (toggleError) {
      setError(friendlyGerencialError(toggleError, "Falha ao marcar reclamação."));
    } finally {
      setTogglingMessageId(null);
    }
  }

  async function saveExistingSellerCadastro(userId: number) {
    const existingUser = data?.users.find((user) => user.id === userId) || null;
    const commissionPercent = parsePercentInput(
      selectedNewUserReferrer ? percentInputValue(selectedNewUserReferrer.commissionPercent) : newUserCommissionPercent,
    );
    if (commissionPercent === null) {
      setError("Informe uma comissão entre 0 e 100.");
      return;
    }
    const sellerReferralCommissionPercent = parsePercentInput(
      selectedNewUserReferrer ? percentInputValue(selectedNewUserReferrer.sellerReferralCommissionPercent) : newUserSellerReferralCommissionPercent,
    );
    if (sellerReferralCommissionPercent === null) {
      setError("Informe uma comissão de indicação entre 0 e 100.");
      return;
    }
    const referredByUserId = newUserReferredByUserId ? Number(newUserReferredByUserId) : undefined;
    if (referredByUserId !== undefined && (!Number.isInteger(referredByUserId) || referredByUserId <= 0)) {
      setError("Selecione um indicador válido.");
      return;
    }
    const parsedDueDays = Number(newUserCommissionDueBusinessDays || 3);
    if (!Number.isInteger(parsedDueDays) || parsedDueDays < 1 || parsedDueDays > 30) {
      setError("Informe um prazo de pagamento entre 1 e 30 dias úteis.");
      return;
    }

    setCreatingUser(true);
    setError(null);
    try {
      const profileBody: Record<string, unknown> = {
        name: newUserName.trim(),
        phone: newUserPhone.trim(),
        commissionPercent,
        canRegisterHbxSellers: false,
      };
      if (referredByUserId) {
        profileBody.referredByUserId = referredByUserId;
      } else {
        profileBody.referredByUserId = null;
        profileBody.sellerReferralCommissionPercent = sellerReferralCommissionPercent;
        profileBody.referredByCommissionPercentSnapshot = 0;
      }
      const updated = await apiFetch<UserItem>(`/users/${userId}/profile`, {
        method: "PATCH",
        body: JSON.stringify(profileBody),
      });
      await apiFetch(`/gerencial/hbx-partners/${userId}/onboarding`, {
        method: "PATCH",
        body: JSON.stringify({
          legalName: newUserName.trim(),
          email: newUserEmail.trim().toLowerCase() || existingUser?.email || existingUser?.username,
          phone: newUserPhone.trim(),
          cpf: newUserCpf.trim(),
          declaredAddress: newUserDeclaredAddress.trim(),
          commissionPercent,
          commissionDueBusinessDays: parsedDueDays,
          sellerReferralCommissionPercent,
          referredByUserId: referredByUserId || null,
          referredByCommissionPercentSnapshot: referredByUserId ? newUserReferredByCommissionPercent : 0,
        }),
      });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.map((item) =>
            item.id === userId
              ? {
                  ...item,
                  name: updated.name ?? newUserName.trim(),
                  phone: updated.phone ?? newUserPhone.trim(),
                  commissionPercent: updated.commissionPercent ?? commissionPercent,
                  canRegisterHbxSellers: updated.canRegisterHbxSellers ?? false,
                  sellerReferralCommissionPercent: updated.sellerReferralCommissionPercent ?? sellerReferralCommissionPercent,
                  referredByUserId: updated.referredByUserId ?? referredByUserId ?? null,
                  referredByCommissionPercentSnapshot: updated.referredByCommissionPercentSnapshot ?? 0,
                  referredByUser: updated.referredByUser ?? existingUser?.referredByUser ?? null,
                }
              : item,
          ),
        };
      });
      await loadOnboardingAttachments(userId);
      setActionInfo(`Cadastro de ${existingUser ? userLabel(existingUser) : newUserName.trim() || `#${userId}`} salvo.`);
    } catch (saveError) {
      setError(friendlyGerencialError(saveError, "Falha ao salvar cadastro do vendedor."));
    } finally {
      setCreatingUser(false);
    }
  }

  async function createCompanyUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (onboardingUserId) {
      await saveExistingSellerCadastro(onboardingUserId);
      return;
    }

    const email = newUserEmail.trim().toLowerCase();
    if (!email) {
      setError("Informe um e-mail válido.");
      return;
    }
    const shouldUseHbxNetwork = isHbxSellerNetwork && newUserRole === "USER";
    const referredByUserId = shouldUseHbxNetwork && newUserReferredByUserId
      ? Number(newUserReferredByUserId)
      : undefined;
    if (referredByUserId !== undefined && (!Number.isInteger(referredByUserId) || referredByUserId <= 0)) {
      setError("Selecione um indicador válido.");
      return;
    }
    const selectedReferrer = referredByUserId
      ? hbxReferrers.find((referrer) => referrer.id === referredByUserId)
      : null;
    if (referredByUserId && !selectedReferrer) {
      setError("Indicador precisa ser parceiro HBX ativo.");
      return;
    }
    const commissionPercent = parsePercentInput(
      selectedReferrer ? percentInputValue(selectedReferrer.commissionPercent) : newUserCommissionPercent,
    );
    if (commissionPercent === null) {
      setError("Informe uma comissão entre 0 e 100.");
      return;
    }
    const sellerReferralCommissionPercent = shouldUseHbxNetwork
      ? parsePercentInput(selectedReferrer ? percentInputValue(selectedReferrer.sellerReferralCommissionPercent) : newUserSellerReferralCommissionPercent)
      : 0;
    if (sellerReferralCommissionPercent === null) {
      setError("Informe uma comissão de indicação entre 0 e 100.");
      return;
    }

    setCreatingUser(true);
    try {
      const requestBody: Record<string, unknown> = {
        email,
        name: newUserName.trim() || undefined,
        phone: newUserPhone.trim() || undefined,
        role: newUserRole,
        password: newUserPassword.trim() || undefined,
      };
      if (newUserRole === "USER") {
        requestBody.cpf = newUserCpf.trim() || undefined;
        requestBody.declaredAddress = newUserDeclaredAddress.trim() || undefined;
        const parsedDueDays = Number(newUserCommissionDueBusinessDays || 3);
        if (!Number.isInteger(parsedDueDays) || parsedDueDays < 1 || parsedDueDays > 30) {
          setError("Informe um prazo de pagamento entre 1 e 30 dias úteis.");
          return;
        }
        requestBody.commissionDueBusinessDays = parsedDueDays;
      }
      if (!(shouldUseHbxNetwork && referredByUserId)) {
        requestBody.commissionPercent = commissionPercent;
      }
      if (shouldUseHbxNetwork) {
        requestBody.canRegisterHbxSellers = false;
        if (newUserReferralCandidateId) {
          requestBody.referralCandidateId = newUserReferralCandidateId;
        }
        if (!referredByUserId) {
          requestBody.sellerReferralCommissionPercent = sellerReferralCommissionPercent ?? 0;
        }
        if (referredByUserId) requestBody.referredByUserId = referredByUserId;
      }
      const payload = await apiFetch<CreateCompanyUserResult>("/users/company/create", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      if (payload?.user) {
        const createdUser: UserItem = {
          ...payload.user,
          role: normalizeRole(payload.user.role),
          createdAt: new Date().toISOString(),
        };
        setData((prev) =>
          prev
            ? {
                ...prev,
                totals: { ...prev.totals, users: prev.totals.users + 1 },
                users: stableUserOrder(prev.users, [...prev.users, createdUser]),
              }
            : prev,
        );
      }

      if (payload?.temporaryPassword) {
        const info = {
          userLabel: userLabel({ id: payload.user.id, name: payload.user.name, username: payload.user.username, email }),
          password: payload.temporaryPassword,
        };
        setCreatedPasswordInfo(info);
        saveCreatedPasswordInfo(info);
        setActionInfo(isHbxSellerNetwork && newUserRole === "USER"
          ? "Parceiro HBX criado. Gere o contrato antes de liberar operação."
          : `${roleLabel(payload.user.role)} criado. Entregue a senha temporária com segurança.`);
      } else {
        setActionInfo(isHbxSellerNetwork && newUserRole === "USER"
          ? "Parceiro HBX criado. Gere o contrato antes de liberar operação."
          : `${roleLabel(payload.user.role)} criado com senha definida manualmente.`);
      }

      if (isHbxSellerNetwork && newUserRole === "USER" && payload?.user?.id) {
        setOnboardingUserId(payload.user.id);
        const pendingRequirements = { ...pendingDocumentRequirements };
        const pendingAttachments = Object.values(pendingOnboardingAttachments);
        let uploadedCount = 0;
        try {
          for (const [kind, required] of Object.entries(pendingRequirements)) {
            await apiFetch(`/gerencial/hbx-partners/${payload.user.id}/onboarding/document-requirement`, {
              method: "PATCH",
              body: JSON.stringify({ kind, required }),
            });
          }
          for (const pending of pendingAttachments) {
            setUploadingAttachmentKind(String(pending.kind));
            await uploadOnboardingAttachmentForUser(payload.user.id, pending.kind, pending.file, pending.required);
            uploadedCount += 1;
          }
          if (uploadedCount > 0) {
            setPendingOnboardingAttachments({});
            setPendingDocumentRequirements({});
            setActionInfo(`Parceiro HBX cadastrado. ${uploadedCount} documento(s) anexado(s). Gere ou envie o contrato antes de liberar o acesso.`);
          }
        } catch (attachmentError) {
          setError(friendlyGerencialError(attachmentError, "Cadastro criado, mas falhou ao anexar um documento."));
        } finally {
          setUploadingAttachmentKind(null);
        }
        await loadOnboardingAttachments(payload.user.id);
      } else {
        resetCreateAccessPopup();
        setCreateAccessOpen(false);
      }
      await load();
    } catch (createError) {
      setError(friendlyGerencialError(createError, "Falha ao cadastrar usuário."));
    } finally {
      setCreatingUser(false);
    }
  }

  function startEditingProfile(user: UserItem) {
    setEditingUserId(user.id);
    setProfileDraft(buildProfileDraft(user));
    setError(null);
  }

  async function saveUserProfile(user: UserItem) {
    const commissionPercent = parsePercentInput(profileDraft.commissionPercent);
    if (commissionPercent === null) {
      setError("Informe uma comissão entre 0 e 100.");
      return;
    }
    const canEditHbxNetwork = isHbxSellerNetwork && normalizeRole(user.role, user.isSystemMaster) === "USER";
    const sellerReferralCommissionPercent = canEditHbxNetwork
      ? parsePercentInput(profileDraft.sellerReferralCommissionPercent)
      : 0;
    const referredByCommissionPercentSnapshot = canEditHbxNetwork
      ? parseOptionalPercentInput(profileDraft.referredByCommissionPercentSnapshot)
      : undefined;
    if (sellerReferralCommissionPercent === null || referredByCommissionPercentSnapshot === null) {
      setError("Informe uma comissão de indicação entre 0 e 100.");
      return;
    }
    const referredByUserId = canEditHbxNetwork && profileDraft.referredByUserId
      ? Number(profileDraft.referredByUserId)
      : undefined;
    if (referredByUserId !== undefined && (!Number.isInteger(referredByUserId) || referredByUserId <= 0)) {
      setError("Selecione um indicador válido.");
      return;
    }

    setSavingProfileUserId(user.id);
    setError(null);
    try {
      const requestBody: Record<string, unknown> = {
        name: profileDraft.name,
        phone: profileDraft.phone,
        commissionPercent,
      };
      if (canEditHbxNetwork) {
        requestBody.canRegisterHbxSellers = false;
        if (referredByUserId) {
          if (referredByUserId !== Number(user.referredByUserId || 0)) {
            requestBody.referredByUserId = referredByUserId;
          }
        } else {
          requestBody.sellerReferralCommissionPercent = sellerReferralCommissionPercent ?? 0;
          requestBody.referredByUserId = null;
          requestBody.referredByCommissionPercentSnapshot = 0;
        }
      }
      const updated = await apiFetch<UserItem>(`/users/${user.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify(requestBody),
      });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.map((item) =>
            item.id === user.id
              ? {
                  ...item,
                  name: updated.name ?? null,
                  phone: updated.phone ?? null,
                  commissionPercent: updated.commissionPercent ?? 0,
                  canRegisterHbxSellers: updated.canRegisterHbxSellers ?? false,
                  sellerReferralCommissionPercent: updated.sellerReferralCommissionPercent ?? 0,
                  referredByUserId: updated.referredByUserId ?? null,
                  referredByCommissionPercentSnapshot: updated.referredByCommissionPercentSnapshot ?? 0,
                  referredByUser: updated.referredByUser ?? null,
                }
              : item,
          ),
        };
      });
      setActionInfo(`Dados comerciais de ${userLabel(user)} atualizados.`);
      setEditingUserId(null);
    } catch (saveError) {
      setError(friendlyGerencialError(saveError, "Falha ao atualizar dados comerciais."));
    } finally {
      setSavingProfileUserId(null);
    }
  }

  async function toggleUserModule(userId: number, moduleKey: string) {
    if (!moduleAccess) return;
    const targetUser = data?.users.find((user) => user.id === userId);
    const role = normalizeRole(targetUser?.role, targetUser?.isSystemMaster);
    if (
      isHbxSellerNetwork &&
      role === "USER" &&
      HBX_SELLER_OPERATIONAL_MODULE_KEYS.has(normalizeModuleKey(moduleKey))
    ) {
      return;
    }
    const userAccess = moduleAccess.users.find((u) => u.id === userId);
    if (!userAccess) return;

    const next = userAccess.modules.map((item) =>
      item.key === moduleKey ? { ...item, allowed: !item.allowed } : item,
    );

    setSavingModuleUserId(userId);
    setError(null);
    try {
      await apiFetch(`/modules/company/user/${userId}/access`, {
        method: "PUT",
        body: JSON.stringify({ modules: next }),
      });
      setModuleAccess((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.map((user) => (user.id === userId ? { ...user, modules: next } : user)),
        };
      });
    } catch (saveError) {
      setError(friendlyGerencialError(saveError, "Falha ao atualizar módulos do usuário."));
    } finally {
      setSavingModuleUserId(null);
    }
  }

  async function markCommissionPaid(leadId: string) {
    if (!leadId) return;
    setMarkingCommissionLeadId(leadId);
    setError(null);
    try {
      await apiFetch(`/gerencial/commission/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ commissionStatus: "paid" }),
      });
      setActionInfo("Comissão marcada como paga.");
      await load();
    } catch (commissionError) {
      setError(friendlyGerencialError(commissionError, "Falha ao marcar comissão como paga."));
    } finally {
      setMarkingCommissionLeadId(null);
    }
  }

  async function updateActivationStatus(leadId: string, saleStatus: "trial_started" | "sale_confirmed" | "canceled" | "inactive") {
    if (!leadId) return;
    const actionKey = `${leadId}:${saleStatus}`;
    setUpdatingActivationLeadId(actionKey);
    setError(null);
    try {
      await apiFetch(`/gerencial/commission/${leadId}/sale-status`, {
        method: "PATCH",
        body: JSON.stringify({ saleStatus }),
      });
      setActionInfo(
        saleStatus === "trial_started"
          ? "Cliente marcado com trial iniciado."
          : saleStatus === "sale_confirmed"
            ? "Cliente marcado com pagamento confirmado."
            : "Cliente removido da fila de ativação.",
      );
      await load();
    } catch (activationError) {
      setError(friendlyGerencialError(activationError, "Falha ao atualizar implantação."));
    } finally {
      setUpdatingActivationLeadId(null);
    }
  }

  async function syncHbxClientCommissions() {
    setSyncingCommissions(true);
    setError(null);
    try {
      const payload = await apiFetch<{ message?: string; updatedLeads?: number }>("/gerencial/commission/sync-hbx-clients", {
        method: "POST",
      });
      setActionInfo(payload?.message || "Sincronização de clientes HBX concluída.");
      await load();
    } catch (syncError) {
      setError(friendlyGerencialError(syncError, "Falha ao sincronizar clientes HBX."));
    } finally {
      setSyncingCommissions(false);
    }
  }

  async function saveCommissionSettings() {
    if (!canManageCommissionSettings) {
      setError("Somente USERMASTER pode alterar o prazo de comissão.");
      return;
    }
    const rawDays = commissionDueDaysDraft.trim();
    const numericDays = Math.trunc(Number(rawDays));
    if (!rawDays || !Number.isFinite(Number(rawDays)) || numericDays < 0 || numericDays > 30) {
      setError("Informe o D+ entre 0 e 30 dias úteis.");
      return;
    }
    const dueBusinessDays = normalizeCommissionDueBusinessDays(numericDays);
    setSavingCommissionSettings(true);
    setError(null);
    try {
      const payload = await apiFetch<{ settings?: { dueBusinessDays?: number | null } }>("/gerencial/commission/settings", {
        method: "PATCH",
        body: JSON.stringify({ commissionDueBusinessDays: dueBusinessDays }),
      });
      const savedDays = normalizeCommissionDueBusinessDays(payload?.settings?.dueBusinessDays ?? dueBusinessDays);
      setCommissionDueDaysDraft(String(savedDays));
      setData((prev) =>
        prev
          ? {
              ...prev,
              commission: prev.commission
                ? {
                    ...prev.commission,
                    settings: {
                      ...(prev.commission.settings || {}),
                      dueBusinessDays: savedDays,
                    },
                  }
                : prev.commission,
            }
          : prev,
      );
      setActionInfo(`Prazo de comissão atualizado para D+${savedDays} úteis.`);
      await load();
    } catch (settingsError) {
      setError(friendlyGerencialError(settingsError, "Falha ao salvar prazo de comissão."));
    } finally {
      setSavingCommissionSettings(false);
    }
  }

  async function closeDueCommissions(sellerUserId?: number) {
    const scope = sellerUserId ? `seller:${sellerUserId}` : "all";
    setClosingCommissionScope(scope);
    setError(null);
    try {
      const payload = await apiFetch<{ message?: string; totalLeadCount?: number; totalAmount?: number }>("/gerencial/commission/payouts", {
        method: "POST",
        body: JSON.stringify({
          sellerUserId: sellerUserId || undefined,
          dueOnly: true,
        }),
      });
      setActionInfo(payload?.message || "Fechamento de comissão concluído.");
      await load();
    } catch (payoutError) {
      setError(friendlyGerencialError(payoutError, "Falha ao fechar comissões."));
    } finally {
      setClosingCommissionScope(null);
    }
  }

  async function copyPayrollSummary() {
    const rows = data?.commission?.payroll || [];
    if (!rows.length) {
      setActionInfo("Nenhuma comissão na folha para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(buildPayrollSummaryText(rows));
      setActionInfo("Resumo da folha de comissão copiado.");
    } catch {
      setError("Não consegui copiar a folha automaticamente neste navegador.");
    }
  }

  const topMessages = useMemo(() => data?.recentMessages?.slice(0, 20) ?? [], [data]);
  const topSurveys = useMemo(() => data?.surveys?.slice(0, 20) ?? [], [data]);
  const enabledModules = useMemo(
    () => (moduleAccess?.modules || []).filter((mod) => mod.companyEnabled),
    [moduleAccess],
  );
  const teamStats = useMemo(() => {
    const users = data?.users || [];
    const masters = users.filter((user) => normalizeRole(user.role, user.isSystemMaster) === "USERMASTER");
    const teamUsers = users.filter((user) => normalizeRole(user.role, user.isSystemMaster) !== "USERMASTER");
    const active = teamUsers.filter((user) => user.isActive);
    const admins = teamUsers.filter((user) => normalizeRole(user.role, user.isSystemMaster) === "ADMIN");
    const sellers = teamUsers.filter((user) => normalizeRole(user.role, user.isSystemMaster) === "USER");
    const activeSellers = sellers.filter((user) => user.isActive);
    const inactive = teamUsers.filter((user) => !user.isActive);
    const extraSeats = Math.max(0, activeSellers.length - INCLUDED_TEAM_USERS);
    const commissionConfigured = sellers.filter((user) => Number(user.commissionPercent || 0) > 0).length;
    const averageCommission =
      activeSellers.length > 0
        ? activeSellers.reduce((total, user) => total + Number(user.commissionPercent || 0), 0) / activeSellers.length
        : 0;
    return {
      active: active.length,
      admins: admins.length,
      sellers: sellers.length,
      masters: masters.length,
      inactive: inactive.length,
      includedSeats: INCLUDED_TEAM_USERS,
      extraSeats,
      teamMonthlyExtra: extraSeats * EXTRA_USER_MONTHLY_PRICE,
      commissionConfigured,
      averageCommission,
    };
  }, [data?.users]);
  const activeSeatRankByUserId = useMemo(() => {
    const ranks = new Map<number, number>();
    (data?.users || [])
      .filter((user) => user.isActive && normalizeRole(user.role, user.isSystemMaster) === "USER")
      .forEach((user, index) => ranks.set(user.id, index + 1));
    return ranks;
  }, [data?.users]);
  const hbxReferrers = useMemo(
    () =>
      isHbxSellerNetwork
        ? (data?.users || []).filter(
            (user) =>
              user.isActive &&
              normalizeRole(user.role, user.isSystemMaster) === "USER",
          )
        : [],
    [data?.users, isHbxSellerNetwork],
  );
  const selectedNewUserReferrer = useMemo(
    () => hbxReferrers.find((referrer) => String(referrer.id) === newUserReferredByUserId) || null,
    [hbxReferrers, newUserReferredByUserId],
  );
  const hbxNetworkStats = useMemo(() => {
    const sellers = (data?.users || []).filter((user) => normalizeRole(user.role, user.isSystemMaster) === "USER");
    return {
      authorized: sellers.filter((user) => Boolean(user.isActive)).length,
      referred: sellers.filter((user) => Number(user.referredByUserId || 0) > 0).length,
    };
  }, [data?.users]);
  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();
    return (data?.users || []).filter((user) => {
      const role = normalizeRole(user.role, user.isSystemMaster);
      const matchesFilter =
        userFilter === "all" ||
        (userFilter === "active" && user.isActive) ||
        (userFilter === "inactive" && !user.isActive) ||
        (userFilter === "admins" && role === "ADMIN") ||
        (userFilter === "sellers" && role === "USER");
      if (!matchesFilter) return false;
      if (!search) return true;
      return [userLabel(user), user.email, user.username, user.phone, roleLabel(role, user.isSystemMaster)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [data?.users, userFilter, userSearch]);

  async function copyTemporaryPassword() {
    if (!createdPasswordInfo?.password) return;
    try {
      await navigator.clipboard.writeText(createdPasswordInfo.password);
      setActionInfo("Senha temporária copiada.");
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione a senha no card e copie manualmente.");
    }
  }

  function dismissCreatedPasswordInfo() {
    setCreatedPasswordInfo(null);
    saveCreatedPasswordInfo(null);
  }

  function renderGerencialNoticePopups() {
    const notices: Array<{
      key: string;
      tone: "info" | "success" | "warning" | "danger";
      icon: string;
      title: string;
      message: string;
      onClose: () => void;
      action?: ReactNode;
      content?: ReactNode;
    }> = [];

    if (error) {
      notices.push({
        key: "error",
        tone: "danger",
        icon: "!",
        title: "Atenção",
        message: error,
        onClose: () => setError(null),
      });
    }

    if (onboardingStatusMessage) {
      notices.push({
        key: "onboarding",
        tone: "success",
        icon: "OK",
        title: "Documentação atualizada",
        message: onboardingStatusMessage,
        onClose: () => setOnboardingStatusMessage(null),
      });
    }

    if (actionInfo) {
      notices.push({
        key: "action",
        tone: "info",
        icon: "i",
        title: "Gerencial",
        message: actionInfo,
        onClose: () => setActionInfo(null),
      });
    }

    if (createdPasswordInfo) {
      notices.push({
        key: "password",
        tone: "warning",
        icon: "••",
        title: `Senha temporária de ${createdPasswordInfo.userLabel}`,
        message: "Copie a senha antes de fechar este aviso.",
        onClose: dismissCreatedPasswordInfo,
        content: <code className="hbx-popup2__secret">{createdPasswordInfo.password}</code>,
        action: (
          <button type="button" className="hbx-popup2__action" onClick={copyTemporaryPassword}>
            Copiar
          </button>
        ),
      });
    }

    if (!notices.length) return null;

    return (
      <div className="hbx-popup-layer" data-clickable="true" data-variant="notice" role="presentation">
        <div className="hbx-popup-stack" role="status" aria-live="polite">
          {notices.map((notice) => (
            <section key={notice.key} className="hbx-popup2 hbx-popup2--notice" data-tone={notice.tone} role="dialog" aria-modal="false" aria-label={notice.title}>
              <div className="hbx-popup2__icon" aria-hidden="true">{notice.icon}</div>
              <div className="hbx-popup2__content">
                <strong>{notice.title}</strong>
                <span>{notice.message}</span>
                {notice.content}
              </div>
              {notice.action || null}
              <button type="button" className="hbx-popup2__close" onClick={notice.onClose} aria-label="Fechar aviso">
                ×
              </button>
            </section>
          ))}
        </div>
      </div>
    );
  }

  function retentionLabel(retentionUntil?: string | null) {
    if (!retentionUntil) return null;
    const ms = new Date(retentionUntil).getTime() - Date.now();
    const days = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
    return `${days} dias restantes para retenção`;
  }

  const mobileTabs: Array<[MobileGerencialTab, string]> = [
    ["status", "Status"],
    ["equipe", "Equipe"],
    ["comissoes", "Comissões"],
    ["modulos", "Módulos"],
    ["sinais", "Sinais"],
  ];
  const desktopGuideTabs: Array<HbxGuide1Tab<DesktopGerencialGuideTab>> = [
    { key: "status", label: "Status", badge: data?.operationAudit?.readinessScore !== undefined ? `${data.operationAudit.readinessScore}%` : teamStats.active },
    { key: "equipe", label: "Equipe", badge: teamStats.active },
    { key: "comissoes", label: "Comissões", badge: formatCurrency(data?.commission?.totals.duePayableAmount || 0) },
    { key: "modulos", label: "Módulos", badge: enabledModules.length },
    { key: "sinais", label: "Sinais", badge: topMessages.length + topSurveys.length },
    { key: "atualizar", label: "Atualizar", badge: loading ? "..." : undefined },
  ];

  function handleDesktopGuideChange(tab: DesktopGerencialGuideTab) {
    if (tab === "atualizar") {
      setDesktopGuideTab("status");
      void load();
      return;
    }
    setDesktopGuideTab(tab);
  }

  function renderReferralCandidatesPanel(surface: "mobile" | "desktop" = "desktop") {
    if (!isHbxSellerNetwork) return null;
    return (
      <ReferralCandidatesPanel
        surface={surface}
        candidates={referralCandidates}
        reviewingCandidateId={reviewingCandidateId}
        userLabel={userLabel}
        candidatePreferredSegmentsLabel={candidatePreferredSegmentsLabel}
        formatShortDate={formatShortDate}
        formatPercent={formatPercent}
        onReview={(candidate, action) => void reviewReferralCandidate(candidate, action)}
        onApply={applyReferralCandidate}
      />
    );
  }

  function renderMobileCreateForm() {
    return (
      <PartnerCreateForm
        onSubmit={createCompanyUser}
        referralCandidatesPanel={renderReferralCandidatesPanel("mobile")}
        referralMatchBox={renderReferralMatchBox("mobile")}
        isHbxSellerNetwork={isHbxSellerNetwork}
        canCreateAdminUsers={canCreateAdminUsers}
        newUserRole={newUserRole}
        setNewUserRole={setNewUserRole}
        roleLabel={roleLabel}
        newUserName={newUserName}
        setNewUserName={setNewUserName}
        newUserEmail={newUserEmail}
        setNewUserEmail={setNewUserEmail}
        newUserPhone={newUserPhone}
        setNewUserPhone={setNewUserPhone}
        newUserCommissionPercent={newUserCommissionPercent}
        setNewUserCommissionPercent={setNewUserCommissionPercent}
        newUserPassword={newUserPassword}
        setNewUserPassword={setNewUserPassword}
        newUserCpf={newUserCpf}
        setNewUserCpf={setNewUserCpf}
        newUserDeclaredAddress={newUserDeclaredAddress}
        setNewUserDeclaredAddress={setNewUserDeclaredAddress}
        newUserCommissionDueBusinessDays={newUserCommissionDueBusinessDays}
        setNewUserCommissionDueBusinessDays={setNewUserCommissionDueBusinessDays}
        newUserSellerReferralCommissionPercent={newUserSellerReferralCommissionPercent}
        setNewUserSellerReferralCommissionPercent={setNewUserSellerReferralCommissionPercent}
        newUserReferredByUserId={newUserReferredByUserId}
        setNewUserReferredByUserId={setNewUserReferredByUserId}
        newUserReferredByCommissionPercent={newUserReferredByCommissionPercent}
        setNewUserReferredByCommissionPercent={setNewUserReferredByCommissionPercent}
        selectedNewUserReferrer={selectedNewUserReferrer}
        hbxReferrers={hbxReferrers}
        userLabel={userLabel}
        formatPercent={formatPercent}
        percentInputValue={percentInputValue}
        creatingUser={creatingUser}
      />
    );
  }

  function renderMobileProfileForm(user: UserItem) {
    const editableReferrers = hbxReferrers.filter((referrer) => referrer.id !== user.id);
    const currentReferrerOption =
      user.referredByUser && !editableReferrers.some((referrer) => referrer.id === user.referredByUser?.id)
        ? user.referredByUser
        : null;
    const role = normalizeRole(user.role, user.isSystemMaster);
    const showHbxNetwork = isHbxSellerNetwork && role === "USER";
    const profileHasReferrer = showHbxNetwork && Boolean(profileDraft.referredByUserId);

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void saveUserProfile(user);
        }}
        className="grid gap-2 rounded-[18px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3"
      >
        <input className="field" value={profileDraft.name} onChange={(event) => setProfileDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Nome" />
        <input className="field" type="tel" value={profileDraft.phone} onChange={(event) => setProfileDraft((draft) => ({ ...draft, phone: event.target.value }))} placeholder="WhatsApp" />
        <input
          className="field disabled:opacity-60"
          inputMode="decimal"
          disabled={profileHasReferrer}
          value={profileDraft.commissionPercent}
          onChange={(event) => setProfileDraft((draft) => ({ ...draft, commissionPercent: event.target.value }))}
          placeholder={profileHasReferrer ? "Comissão herdada" : "Comissão %"}
        />

        {showHbxNetwork ? (
          <>
            <label className="flex items-start gap-3 rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface)] p-3 text-sm">
              <span>
                <strong className="block">Indicação HBX</strong>
                <small className="text-[var(--hbx-mobile-muted)]">Parceiro ativo indica; Master cadastra.</small>
              </span>
            </label>
            <input
              className="field disabled:opacity-60"
              inputMode="decimal"
              disabled={profileHasReferrer}
              value={profileDraft.sellerReferralCommissionPercent}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, sellerReferralCommissionPercent: event.target.value }))}
              placeholder={profileHasReferrer ? "Herança herdada" : "Herança que recebe %"}
            />
            <select
              className="field"
              value={profileDraft.referredByUserId}
              onChange={(event) => {
                const selectedReferrerId = event.target.value;
                const selectedReferrer = hbxReferrers.find((referrer) => String(referrer.id) === selectedReferrerId);
                setProfileDraft((draft) => ({
                  ...draft,
                  referredByUserId: selectedReferrerId,
                  commissionPercent: selectedReferrer ? percentInputValue(selectedReferrer.commissionPercent) : draft.commissionPercent,
                  sellerReferralCommissionPercent: selectedReferrer ? percentInputValue(selectedReferrer.sellerReferralCommissionPercent) : draft.sellerReferralCommissionPercent,
                  referredByCommissionPercentSnapshot: selectedReferrerId
                    ? percentInputValue(selectedReferrer?.sellerReferralCommissionPercent || user.referredByCommissionPercentSnapshot || 0)
                    : "0",
                }));
              }}
            >
              <option value="">Direto HBX</option>
              {currentReferrerOption ? <option value={currentReferrerOption.id}>{referralUserLabel(currentReferrerOption)}</option> : null}
              {editableReferrers.map((referrer) => (
                <option key={referrer.id} value={referrer.id}>
                  {userLabel(referrer)} · {formatPercent(referrer.sellerReferralCommissionPercent)}
                </option>
              ))}
            </select>
            <input
              className="field disabled:opacity-60"
              inputMode="decimal"
              disabled
              value={profileDraft.referredByCommissionPercentSnapshot}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, referredByCommissionPercentSnapshot: event.target.value }))}
              placeholder="Herança automática do indicador"
            />
            {profileHasReferrer ? (
              <p className="text-xs text-[var(--hbx-mobile-muted)]">
                Comissão e herança deste vendedor seguem o indicador.
              </p>
            ) : null}
          </>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setEditingUserId(null)} className="hbx-mobile-secondary-button">
            Cancelar
          </button>
          <button type="submit" disabled={savingProfileUserId === user.id} className="hbx-mobile-primary-button">
            {savingProfileUserId === user.id ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    );
  }

  function renderMobileUserCard(user: UserItem, options: { modulesOnly?: boolean } = {}) {
    const role = normalizeRole(user.role, user.isSystemMaster);
    const isAdmin = role === "ADMIN";
    const isMaster = role === "USERMASTER";
    const isSeller = role === "USER";
    const showHbxNetwork = isHbxSellerNetwork && isSeller;
    const userModules = moduleAccess?.users.find((item) => item.id === user.id)?.modules || [];
    const seatRank = activeSeatRankByUserId.get(user.id) || 0;
    const isExtraSeat = isSeller && user.isActive && seatRank > INCLUDED_TEAM_USERS;
    const isEditingProfile = editingUserId === user.id;

    return (
      <article key={user.id} className="hbx-mobile-card grid gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <strong className="block truncate">{userLabel(user)}</strong>
            <span className="block truncate text-xs text-[var(--hbx-mobile-muted)]">{user.email || "sem e-mail"}</span>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-right">
            <span className="rounded-full border border-[var(--hbx-mobile-border)] px-2 py-1 text-[0.68rem] font-bold">
              {roleLabel(role, user.isSystemMaster)}
            </span>
            <span className={user.isActive ? "text-xs font-bold text-[var(--hbx-mobile-success)]" : "text-xs font-bold text-[var(--hbx-mobile-danger)]"}>
              {user.isActive ? "ATIVO" : "INATIVO"}
            </span>
          </div>
        </div>

        {!options.modulesOnly ? (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-2">
              <span className="block text-[0.66rem] text-[var(--hbx-mobile-muted)]">WhatsApp</span>
              <strong className="block truncate">{userPhoneLabel(user)}</strong>
            </div>
            <div className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-2">
              <span className="block text-[0.66rem] text-[var(--hbx-mobile-muted)]">Comissão</span>
              <strong>{formatPercent(user.commissionPercent)}</strong>
            </div>
            <div className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-2">
              <span className="block text-[0.66rem] text-[var(--hbx-mobile-muted)]">Vendedor</span>
              <strong>{isMaster ? "Master" : isAdmin ? "Admin" : isExtraSeat ? "Extra" : seatRank || "-"}</strong>
            </div>
          </div>
        ) : null}

        {showHbxNetwork && !options.modulesOnly ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-2">
              <span className="block text-[0.66rem] text-[var(--hbx-mobile-muted)]">Rede HBX</span>
              <strong>{user.isActive ? "Indica" : "Inativo"}</strong>
            </div>
            <div className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-2">
              <span className="block text-[0.66rem] text-[var(--hbx-mobile-muted)]">Herdada</span>
              <strong>{formatPercent(user.sellerReferralCommissionPercent)}</strong>
            </div>
            <div className="col-span-2 rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-2">
              <span className="block text-[0.66rem] text-[var(--hbx-mobile-muted)]">Indicado por</span>
              <strong className="block truncate">{referralUserLabel(user.referredByUser)}</strong>
            </div>
          </div>
        ) : null}

        {isEditingProfile && !options.modulesOnly && !showHbxNetwork ? renderMobileProfileForm(user) : null}
        {!options.modulesOnly ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={deletingUserId === user.id || changingUserId === user.id || !user.isActive || role === "USER"} onClick={() => setRole(user.id, "USER")} className="hbx-mobile-secondary-button">
              Vendedor
            </button>
            <button type="button" disabled={deletingUserId === user.id || changingUserId === user.id || !user.isActive || role === "ADMIN"} onClick={() => setRole(user.id, "ADMIN")} className="hbx-mobile-secondary-button">
              Admin
            </button>
            <button
              type="button"
              disabled={deletingUserId === user.id || savingProfileUserId === user.id}
              onClick={() => {
                if (showHbxNetwork) void openSellerCadastroPopup(user);
                else startEditingProfile(user);
              }}
              className="hbx-mobile-secondary-button"
            >
              Editar
            </button>
            <button
              type="button"
              disabled={deletingUserId === user.id || togglingActiveUserId === user.id}
              onClick={() => {
                if (!user.isActive && showHbxNetwork) void openSellerCadastroPopup(user);
                else toggleActive(user.id, Boolean(user.isActive));
              }}
              className={user.isActive ? "hbx-mobile-secondary-button" : "hbx-mobile-primary-button"}
            >
              {user.isActive ? "Desativar" : isHbxSellerNetwork && isSeller ? "Liberar parceiro" : "Reativar"}
            </button>
            <button type="button" disabled={deletingUserId === user.id} onClick={() => void deleteUser(user)} className="hbx-mobile-secondary-button col-span-2 text-red-700">
              {deletingUserId === user.id ? "Excluindo..." : "Excluir"}
            </button>
          </div>
        ) : null}

        <div className="grid gap-2">
          <span className="text-xs font-bold uppercase text-[var(--hbx-mobile-muted)]">Módulos</span>
          {isAdmin || isMaster ? (
            <p className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3 text-sm text-[var(--hbx-mobile-muted)]">
              {isMaster ? "USERMASTER não é alterado no mobile." : "Admin usa todos os módulos liberados pelo plano."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {enabledModules.map((mod) => {
                const row = userModules.find((item) => item.key === mod.key);
                const moduleKey = normalizeModuleKey(mod.key);
                const hbxSellerOperationalModule = showHbxNetwork && HBX_SELLER_OPERATIONAL_MODULE_KEYS.has(moduleKey);
                const lockedForSeller = !hbxSellerOperationalModule && SELLER_LOCKED_MODULE_KEYS.has(moduleKey);
                const allowed = hbxSellerOperationalModule || (!lockedForSeller && (row ? row.allowed : Boolean(mod.companyEnabled)));
                return (
                  <button
                    key={`${user.id}-mobile-${mod.key}`}
                    type="button"
                    disabled={hbxSellerOperationalModule || lockedForSeller || savingModuleUserId === user.id || !user.isActive}
                    onClick={() => toggleUserModule(user.id, mod.key)}
                    className={allowed && user.isActive ? "hbx-mobile-primary-button" : "hbx-mobile-secondary-button"}
                    title={hbxSellerOperationalModule ? "Módulo padrão do parceiro HBX" : undefined}
                  >
                    {moduleLabel(mod)} {hbxSellerOperationalModule ? "ON padrão" : lockedForSeller ? "bloqueado" : allowed ? "ON" : "OFF"}
                  </button>
                );
              })}
              {enabledModules.length === 0 ? <span className="text-sm text-[var(--hbx-mobile-muted)]">Nenhum módulo liberado.</span> : null}
            </div>
          )}
        </div>
      </article>
    );
  }

  function renderMobileCommissions() {
    const payrollRows = data?.commission?.payroll || [];
    const activationQueue = data?.commission?.activationQueue || [];
    return (
      <div className="grid gap-3">
        <section className="hbx-mobile-card grid gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase text-[var(--hbx-mobile-primary)]">D+{commissionDueDays} úteis</span>
              <h2 className="text-lg font-semibold">Comissões</h2>
            </div>
            <strong>{formatCurrency(data?.commission?.totals.payableAmount || 0)}</strong>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3">
              <span className="block text-xs text-[var(--hbx-mobile-muted)]">Liberado</span>
              <strong>{formatCurrency(data?.commission?.totals.duePayableAmount || 0)}</strong>
            </div>
            <div className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3">
              <span className="block text-xs text-[var(--hbx-mobile-muted)]">Herdada</span>
              <strong>{formatCurrency(data?.commission?.totals.inheritedAmount || 0)}</strong>
            </div>
            <div className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3">
              <span className="block text-xs text-[var(--hbx-mobile-muted)]">Ativos</span>
              <strong>{data?.commission?.totals.activeClients || 0}</strong>
            </div>
            <div className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3">
              <span className="block text-xs text-[var(--hbx-mobile-muted)]">Aguardando</span>
              <strong>{data?.commission?.totals.pendingActivation || 0}</strong>
            </div>
          </div>
          {canManageCommissionSettings ? (
            <div className="grid grid-cols-[1fr_auto] gap-2 rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3">
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-bold uppercase text-[var(--hbx-mobile-muted)]">Prazo comissão</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={commissionDueDaysDraft}
                  onChange={(event) => setCommissionDueDaysDraft(event.target.value)}
                  className="field"
                  aria-label="Dias úteis para liberar comissão"
                />
              </label>
              <button type="button" disabled={savingCommissionSettings} onClick={() => void saveCommissionSettings()} className="hbx-mobile-primary-button self-end">
                {savingCommissionSettings ? "..." : `D+${commissionDueDays}`}
              </button>
            </div>
          ) : (
            <div className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3 text-sm">
              <span className="block text-xs font-bold uppercase text-[var(--hbx-mobile-muted)]">Regra USERMASTER</span>
              <strong>D+{commissionDueDays} úteis</strong>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={syncingCommissions} onClick={() => void syncHbxClientCommissions()} className="hbx-mobile-secondary-button">
              {syncingCommissions ? "Sincronizando..." : "Sincronizar"}
            </button>
            <button type="button" disabled={closingCommissionScope !== null || (data?.commission?.totals.duePayableAmount || 0) <= 0} onClick={() => void closeDueCommissions()} className="hbx-mobile-primary-button">
              {closingCommissionScope === "all" ? "Fechando..." : "Fechar liberadas"}
            </button>
          </div>
        </section>

        <section className="hbx-mobile-card grid gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase text-[var(--hbx-mobile-primary)]">Implantação</span>
              <h2 className="text-lg font-semibold">Aguardando ativação</h2>
            </div>
            <strong>{activationQueue.length}</strong>
          </div>
          {activationQueue.length === 0 ? (
            <p className="text-sm text-[var(--hbx-mobile-muted)]">Nenhum cliente aguardando implantação agora.</p>
          ) : (
            activationQueue.map((client) => (
              <article key={client.leadId} className="grid gap-2 rounded-[16px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <strong className="block truncate">{client.name || "Cliente sem nome"}</strong>
                    <span className="text-xs text-[var(--hbx-mobile-muted)]">
                      {salePlanLabel(client.salePlanKey)} · {client.city || "sem cidade"} · {formatCurrency(client.saleValue || 0)}
                    </span>
                  </div>
                  <span className={commissionActivationBadgeClass(client)}>{commissionActivationStageLabel(client)}</span>
                </div>
                <p className="text-xs text-[var(--hbx-mobile-muted)]">{commissionActivationHint(client, commissionDueDays)}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {client.email ? <span className="badge">{client.email}</span> : null}
                  {client.commissionLinkedAt ? <span className="badge">Vinculado {formatShortDate(client.commissionLinkedAt)}</span> : null}
                </div>
                {client.commissionNote ? <p className="text-xs text-[var(--hbx-mobile-muted)]">{client.commissionNote}</p> : null}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={updatingActivationLeadId !== null}
                    onClick={() => void updateActivationStatus(client.leadId, "trial_started")}
                    className="hbx-mobile-primary-button"
                  >
                    {updatingActivationLeadId === `${client.leadId}:trial_started` ? "..." : "Trial"}
                  </button>
                  <button
                    type="button"
                    disabled={updatingActivationLeadId !== null}
                    onClick={() => void updateActivationStatus(client.leadId, "sale_confirmed")}
                    className="hbx-mobile-secondary-button"
                  >
                    {updatingActivationLeadId === `${client.leadId}:sale_confirmed` ? "..." : "Pago"}
                  </button>
                  <button
                    type="button"
                    disabled={updatingActivationLeadId !== null}
                    onClick={() => void updateActivationStatus(client.leadId, "canceled")}
                    className="hbx-mobile-secondary-button"
                  >
                    {updatingActivationLeadId === `${client.leadId}:canceled` ? "..." : "Cancelar"}
                  </button>
                </div>
              </article>
            ))
          )}
        </section>

        <section className="hbx-mobile-card grid gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase text-[var(--hbx-mobile-primary)]">Folha</span>
              <h2 className="text-lg font-semibold">Pagamento dos vendedores</h2>
            </div>
            <button type="button" disabled={!payrollRows.length} onClick={() => void copyPayrollSummary()} className="hbx-mobile-secondary-button">
              Copiar
            </button>
          </div>
          {payrollRows.length === 0 ? (
            <p className="text-sm text-[var(--hbx-mobile-muted)]">Nenhuma comissão aguardando pagamento.</p>
          ) : (
            payrollRows.map((row) => (
              <article key={row.sellerUserId} className="grid gap-2 rounded-[16px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <strong className="block truncate">{row.sellerName}</strong>
                    <span className="text-xs text-[var(--hbx-mobile-muted)]">
                      {payrollStatusLabel(row.status)} · {row.duePayableCount} liberada(s) · {formatShortDate(row.nextDueAt)}
                    </span>
                  </div>
                  {row.duePayableAmount > 0 ? (
                    <button type="button" disabled={closingCommissionScope !== null} onClick={() => void closeDueCommissions(row.sellerUserId)} className="hbx-mobile-primary-button">
                      Pagar
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><span className="block text-xs text-[var(--hbx-mobile-muted)]">Liberado</span><strong>{formatCurrency(row.duePayableAmount || 0)}</strong></div>
                  <div><span className="block text-xs text-[var(--hbx-mobile-muted)]">A pagar</span><strong>{formatCurrency(row.payableAmount || 0)}</strong></div>
                  <div><span className="block text-xs text-[var(--hbx-mobile-muted)]">Ativos</span><strong>{row.activeClients}</strong></div>
                </div>
              </article>
            ))
          )}
        </section>

        {(data?.commission?.sellers || []).map((seller) => (
          <article key={seller.userId} className="hbx-mobile-card grid gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <strong className="block truncate">{seller.name}</strong>
                <span className="text-xs text-[var(--hbx-mobile-muted)]">{formatPercent(seller.commissionPercent)} · {seller.assignedCards} card(s)</span>
              </div>
              {seller.duePayableAmount > 0 ? (
                <button type="button" disabled={closingCommissionScope !== null} onClick={() => void closeDueCommissions(seller.userId)} className="hbx-mobile-primary-button">
                  Fechar
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><span className="block text-xs text-[var(--hbx-mobile-muted)]">A pagar</span><strong>{formatCurrency(seller.payableAmount || 0)}</strong></div>
              <div><span className="block text-xs text-[var(--hbx-mobile-muted)]">Herdada</span><strong>{formatCurrency(seller.inheritedAmount || 0)}</strong></div>
              <div><span className="block text-xs text-[var(--hbx-mobile-muted)]">Ativos</span><strong>{seller.activeClients}</strong></div>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderMobileStatus() {
    const audit = data?.operationAudit;
    if (!audit) {
      return <div className="hbx-mobile-empty">Auditoria operacional indisponível.</div>;
    }
    return (
      <div className="grid gap-3">
        <section className="hbx-mobile-card grid gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase text-[var(--hbx-mobile-primary)]">Passo 8</span>
              <h2 className="text-lg font-semibold">CRM gerencial</h2>
              <p className="mt-1 text-sm text-[var(--hbx-mobile-muted)]">Prontidão da operação comercial.</p>
            </div>
            <div className="text-right">
              <strong className="block text-2xl">{audit.readinessScore}%</strong>
              <span className="text-xs text-[var(--hbx-mobile-muted)]">{operationStatusLabel(audit.status)}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3">
              <span className="block text-xs text-[var(--hbx-mobile-muted)]">Cards</span>
              <strong>{audit.pipeline.assignedCards}/{audit.pipeline.totalCards}</strong>
            </div>
            <div className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3">
              <span className="block text-xs text-[var(--hbx-mobile-muted)]">Retornos</span>
              <strong>{audit.pipeline.dueReturns}</strong>
            </div>
            <div className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3">
              <span className="block text-xs text-[var(--hbx-mobile-muted)]">Liberado</span>
              <strong>{formatCurrency(audit.finance.duePayableAmount || 0)}</strong>
            </div>
          </div>
        </section>

        <section className="hbx-mobile-card grid gap-2">
          <h2 className="text-lg font-semibold">Checklist</h2>
          {audit.checklist.map((item) => (
            <article key={item.key} className="rounded-[16px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <strong className="block truncate">{item.title}</strong>
                  <span className="text-xs text-[var(--hbx-mobile-muted)]">{item.value}</span>
                </div>
                <span className={checklistBadgeClass(item.status)}>{checklistStatusLabel(item.status)}</span>
              </div>
              <p className="mt-2 text-sm text-[var(--hbx-mobile-muted)]">{item.hint}</p>
            </article>
          ))}
        </section>

        {audit.nextActions.length ? (
          <section className="hbx-mobile-card grid gap-2">
            <h2 className="text-lg font-semibold">Próximas ações</h2>
            {audit.nextActions.map((item) => (
              <p key={item.key} className="rounded-[14px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3 text-sm">
                <strong className="block">{item.title}</strong>
                <span className="text-[var(--hbx-mobile-muted)]">{item.hint}</span>
              </p>
            ))}
          </section>
        ) : null}
      </div>
    );
  }

  function renderMobileSignals() {
    return (
      <div className="grid gap-3">
        <section className="hbx-mobile-card grid gap-2">
          <h2 className="text-lg font-semibold">Mensagens recentes</h2>
          {topMessages.length === 0 ? <p className="text-sm text-[var(--hbx-mobile-muted)]">Sem mensagens recentes.</p> : null}
          {topMessages.slice(0, 8).map((message) => (
            <article key={message.id} className="rounded-[16px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <strong>{message.direction}</strong>
                <button type="button" disabled={togglingMessageId === message.id} onClick={() => toggleComplaint(message.id, message.isComplaint)} className="hbx-mobile-secondary-button">
                  {message.isComplaint ? "Remover" : "Reclamar"}
                </button>
              </div>
              <p className="mt-2 line-clamp-3">{message.body}</p>
            </article>
          ))}
        </section>
        <section className="hbx-mobile-card grid gap-2">
          <h2 className="text-lg font-semibold">Avaliações</h2>
          {topSurveys.length === 0 ? <p className="text-sm text-[var(--hbx-mobile-muted)]">Sem avaliações registradas.</p> : null}
          {topSurveys.slice(0, 6).map((survey) => (
            <article key={survey.id} className="rounded-[16px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3 text-sm">
              <strong>Nota: {survey.rating ?? "N/A"}</strong>
              <p className="mt-1 line-clamp-3">{survey.feedback || "Sem comentário"}</p>
            </article>
          ))}
        </section>
      </div>
    );
  }

  function renderCreateAccessPopup() {
    if (!createAccessOpen) return null;
    const canUseDocs = Boolean(isHbxSellerNetwork && newUserRole === "USER");
    const canPersistDocs = Boolean(canUseDocs && onboardingUserId);
    const canActivatePartner = Boolean(canPersistDocs && onboardingReadiness?.complete);

    return (
      <div className="hbx-popup-layer" data-clickable="true" role="presentation">
        <section className="hbx-popup2 hbx-popup2--partner-access" data-tone="info" role="dialog" aria-modal="true" aria-label="Criar acesso">
          <header className="hbx-partner-popup__header">
            <div>
              <strong>{onboardingUserId ? "Cadastro do vendedor" : isHbxSellerNetwork ? "Parceiro HBX" : "Novo acesso"}</strong>
              <span>{onboardingUserId ? `#${onboardingUserId}` : "Cadastro"}</span>
            </div>
            <button
              type="button"
              className="hbx-popup2__close"
              onClick={() => {
                setCreateAccessOpen(false);
                resetCreateAccessPopup();
              }}
              aria-label="Fechar"
            >
              ×
            </button>
          </header>

          <form onSubmit={createCompanyUser} autoComplete="off" className="hbx-partner-popup__grid">
            <div className="hbx-partner-popup__panel">
              {canCreateAdminUsers ? (
                <div className="hbx-partner-popup__segmented">
                  {(["USER", "ADMIN"] as const).map((role) => (
                    <button key={role} type="button" onClick={() => setNewUserRole(role)} data-active={newUserRole === role}>
                      {roleLabel(role)}
                    </button>
                  ))}
                </div>
              ) : null}
              <label>
                <span>Nome</span>
                <input className="field" value={newUserName} onChange={(event) => setNewUserName(event.target.value)} />
              </label>
              <label>
                <span>E-mail</span>
                <input className="field" type="email" name="hbx-create-seller-login-popup" autoComplete="off" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} disabled={Boolean(onboardingUserId)} required />
              </label>
              <label>
                <span>WhatsApp</span>
                <input className="field" type="tel" value={newUserPhone} onChange={(event) => setNewUserPhone(event.target.value)} />
              </label>
              {isHbxSellerNetwork && newUserRole === "USER" ? renderReferralMatchBox("desktop") : null}
              <div className="hbx-partner-popup__twocol">
                <label>
                  <span>Comissão</span>
                  <input
                    className="field disabled:opacity-60"
                    inputMode="decimal"
                    disabled={Boolean(selectedNewUserReferrer)}
                    value={selectedNewUserReferrer ? percentInputValue(selectedNewUserReferrer.commissionPercent) : newUserCommissionPercent}
                    onChange={(event) => setNewUserCommissionPercent(event.target.value)}
                  />
                </label>
                <label>
                  <span>D+</span>
                  <input className="field" inputMode="numeric" value={newUserCommissionDueBusinessDays} onChange={(event) => setNewUserCommissionDueBusinessDays(event.target.value)} />
                </label>
              </div>
              {isHbxSellerNetwork && newUserRole === "USER" ? (
                <>
                  <div className="hbx-partner-popup__twocol">
                    <label>
                      <span>CPF</span>
                      <input className="field" value={newUserCpf} onChange={(event) => setNewUserCpf(event.target.value)} />
                    </label>
                    <label>
                      <span>Senha</span>
                      <input className="field" type="password" name="hbx-create-seller-password-popup" autoComplete="new-password" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} disabled={Boolean(onboardingUserId)} />
                    </label>
                  </div>
                  <label>
                    <span>Endereço</span>
                    <input className="field" value={newUserDeclaredAddress} onChange={(event) => setNewUserDeclaredAddress(event.target.value)} />
                  </label>
                  <div className="hbx-partner-popup__twocol">
                    <label>
                      <span>Indicado por</span>
                      <select
                        className="field"
                        value={newUserReferredByUserId}
                        onChange={(event) => {
                          const selectedReferrerId = event.target.value;
                          const selectedReferrer = hbxReferrers.find((referrer) => String(referrer.id) === selectedReferrerId);
                          setNewUserReferredByUserId(selectedReferrerId);
                          if (selectedReferrer) {
                            setNewUserCommissionPercent(percentInputValue(selectedReferrer.commissionPercent));
                            setNewUserSellerReferralCommissionPercent(percentInputValue(selectedReferrer.sellerReferralCommissionPercent));
                            setNewUserReferredByCommissionPercent(percentInputValue(selectedReferrer.sellerReferralCommissionPercent));
                          }
                          if (!selectedReferrerId) setNewUserReferredByCommissionPercent("");
                        }}
                      >
                        <option value="">Direto HBX</option>
                        {hbxReferrers.map((referrer) => (
                          <option key={referrer.id} value={referrer.id}>{userLabel(referrer)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Herança</span>
                      <input className="field disabled:opacity-60" disabled value={selectedNewUserReferrer ? percentInputValue(selectedNewUserReferrer.sellerReferralCommissionPercent) : newUserReferredByCommissionPercent} />
                    </label>
                  </div>
                </>
              ) : null}
              <button type="submit" disabled={creatingUser} className="btn btn-primary btn-sm">
                {creatingUser ? (onboardingUserId ? "Salvando..." : "Cadastrando...") : onboardingUserId ? "Salvar cadastro" : isHbxSellerNetwork ? "Cadastrar vendedor" : "Criar acesso"}
              </button>
            </div>

            <PartnerOnboardingPanel
              canUseDocs={canUseDocs}
              canPersistDocs={canPersistDocs}
              canActivatePartner={canActivatePartner}
              onboardingReadiness={onboardingReadiness}
              pendingOnboardingAttachments={pendingOnboardingAttachments}
              pendingDocumentRequirements={pendingDocumentRequirements}
              onboardingAttachments={onboardingAttachments}
              uploadingAttachmentKind={uploadingAttachmentKind}
              downloadingOnboardingAttachmentId={downloadingOnboardingAttachmentId}
              removingOnboardingAttachmentId={removingOnboardingAttachmentId}
              generatingContract={generatingContract}
              sendingOnboardingEmail={sendingOnboardingEmail}
              togglingActiveUserId={togglingActiveUserId}
              onboardingUserId={onboardingUserId}
              onboardingAttachmentLabel={onboardingAttachmentLabel}
              uploadOnboardingAttachment={(kind, file, required) => void uploadOnboardingAttachment(kind, file, required)}
              updateOnboardingDocumentRequirement={(kind, required) => void updateOnboardingDocumentRequirement(kind, required)}
              downloadOnboardingAttachment={(attachment) => void downloadOnboardingAttachment(attachment)}
              removeOnboardingAttachment={(kind, attachment) => void removeOnboardingAttachment(kind, attachment)}
              generateOnboardingContract={() => void generateOnboardingContract()}
              sendOnboardingEmail={() => void sendOnboardingEmail()}
              activateOnboardingPartner={() => void activateOnboardingPartner()}
            />
          </form>
        </section>
      </div>
    );
  }

  function renderMobileGerencial() {
    return (
      <section className="hbx-mobile-page" aria-label="Gerencial mobile">
        <header className="hbx-mobile-header">
          <div>
            <span className="text-xs font-bold uppercase text-[var(--hbx-mobile-primary)]">Gerencial</span>
            <h1 className="text-xl font-bold">Equipe e comissão</h1>
          </div>
          <button type="button" onClick={load} className="hbx-mobile-secondary-button">
            Atualizar
          </button>
        </header>

        {!data ? (
          <div className="hbx-mobile-empty">{loading ? "Carregando..." : "Sem dados."}</div>
        ) : (
          <>
            <section className="hbx-mobile-hero grid gap-3">
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div><strong className="block text-lg">{teamStats.active}</strong><span className="text-xs text-[var(--hbx-mobile-muted)]">Ativos</span></div>
                <div><strong className="block text-lg">{teamStats.sellers}</strong><span className="text-xs text-[var(--hbx-mobile-muted)]">Vend.</span></div>
                <div><strong className="block text-lg">{teamStats.admins}</strong><span className="text-xs text-[var(--hbx-mobile-muted)]">Admins</span></div>
                <div><strong className="block text-lg">{teamStats.extraSeats}</strong><span className="text-xs text-[var(--hbx-mobile-muted)]">Extras</span></div>
              </div>
              {isHbxSellerNetwork ? (
                <p className="rounded-[16px] border border-[var(--hbx-mobile-border)] bg-[var(--hbx-mobile-surface-soft)] p-3 text-sm">
                  Rede HBX: {hbxNetworkStats.authorized} parceiro(s) indicam, {hbxNetworkStats.referred} vieram por indicação.
                </p>
              ) : null}
            </section>

            <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Abas do Gerencial">
              {mobileTabs.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMobileTab(value)}
                  className={mobileTab === value ? "hbx-mobile-primary-button shrink-0" : "hbx-mobile-secondary-button shrink-0"}
                >
                  {label}
                </button>
              ))}
            </nav>

            {mobileTab === "status" ? renderMobileStatus() : null}

            {mobileTab === "equipe" ? (
              <div className="grid gap-3">
                <section className="hbx-mobile-card grid gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetCreateAccessPopup();
                      setCreateAccessOpen(true);
                    }}
                    className="hbx-mobile-primary-button"
                  >
                    Criar acesso
                  </button>
                  {renderReferralCandidatesPanel("mobile")}
                  <input className="field" type="search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Buscar equipe" />
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["active", "Ativos"],
                      ["sellers", "Vendedores"],
                      ["admins", "Admins"],
                      ["inactive", "Inativos"],
                      ["all", "Todos"],
                    ] as Array<[UserFilter, string]>).map(([value, label]) => (
                      <button key={value} type="button" onClick={() => setUserFilter(value)} className={userFilter === value ? "hbx-mobile-primary-button" : "hbx-mobile-secondary-button"}>
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
                {filteredUsers.length ? filteredUsers.map((user) => renderMobileUserCard(user)) : <div className="hbx-mobile-empty">Nenhum usuário encontrado.</div>}
              </div>
            ) : null}

            {mobileTab === "comissoes" ? renderMobileCommissions() : null}
            {mobileTab === "modulos" ? (
              <div className="grid gap-3">
                {(data.users || []).map((user) => renderMobileUserCard(user, { modulesOnly: true }))}
              </div>
            ) : null}
            {mobileTab === "sinais" ? renderMobileSignals() : null}
          </>
        )}

        {renderCreateAccessPopup()}
        {renderGerencialNoticePopups()}
        <HbxMobileDock
          primaryLabel="Cadastrar"
          primaryIcon="plus"
          onPrimaryAction={() => {
            resetCreateAccessPopup();
            setCreateAccessOpen(true);
          }}
          onComissao={() => setMobileTab("comissoes")}
          onRelatorio={() => setMobileTab("sinais")}
        />
      </section>
    );
  }

  if (hasToken === null) {
    if (mobileRoute) {
      return <main className="hbx-mobile-page"><div className="hbx-mobile-empty">Carregando...</div></main>;
    }
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando...</div>
        </div>
      </main>
    );
  }
  if (!hasToken) return null;

  if (mobileRoute) return renderMobileGerencial();

  const showDesktopStatus = desktopGuideTab === "status";
  const showDesktopCommissions = desktopGuideTab === "comissoes";
  const showDesktopTeam = desktopGuideTab === "equipe";
  const showDesktopModules = desktopGuideTab === "modulos";
  const showDesktopSignals = desktopGuideTab === "sinais";

  return (
    <DashboardScaffold
      title="Gerencial"
      description="Cadastro de vendedores, permissões administrativas e controle de acesso por módulo."
      hideHeader
    >
      {renderGerencialNoticePopups()}
      {!data ? (
        <div className="panel p-4 text-sm text-muted">{loading ? "Carregando..." : "Sem dados."}</div>
      ) : (
        <>
          <div className="hbx-guide1-slot">
            <HbxGuide1 tabs={desktopGuideTabs} activeKey={desktopGuideTab} ariaLabel="Gerencial" onChange={handleDesktopGuideChange} />
          </div>
          {renderCreateAccessPopup()}

          {showDesktopStatus && data.operationAudit ? (
            <section className="panel p-4 md:p-5 rounded-[20px]">
              <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                <div className="min-w-0">
                  <span className="badge badge-brand">Passo 8</span>
                  <h2 className="mt-2 text-lg font-semibold">Auditoria do CRM gerencial</h2>
                  <p className="mt-1 text-sm text-muted">
                    Mostra se a operação está pronta para vender: equipe, cards, retornos e pagamento de comissão.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 xl:min-w-[520px]">
                  <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                    <p className="text-xs text-muted">Prontidão</p>
                    <strong className="mt-1 block text-2xl">{data.operationAudit.readinessScore}%</strong>
                    <span className="text-xs text-muted">{operationStatusLabel(data.operationAudit.status)}</span>
                  </article>
                  <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                    <p className="text-xs text-muted">Cards com dono</p>
                    <strong className="mt-1 block text-lg">
                      {data.operationAudit.pipeline.assignedCards}/{data.operationAudit.pipeline.totalCards}
                    </strong>
                  </article>
                  <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                    <p className="text-xs text-muted">Retornos vencidos</p>
                    <strong className="mt-1 block text-lg">{data.operationAudit.pipeline.dueReturns}</strong>
                  </article>
                  <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                    <p className="text-xs text-muted">Comissão liberada</p>
                    <strong className="mt-1 block text-lg">{formatCurrency(data.operationAudit.finance.duePayableAmount || 0)}</strong>
                  </article>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr] gap-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {data.operationAudit.checklist.map((item) => (
                    <article key={item.key} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <strong className="block truncate text-sm">{item.title}</strong>
                          <span className="text-xs text-muted">{item.value}</span>
                        </div>
                        <span className={checklistBadgeClass(item.status)}>{checklistStatusLabel(item.status)}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted">{item.hint}</p>
                    </article>
                  ))}
                </div>
                <div className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                  <h3 className="font-semibold">Próximas ações</h3>
                  {data.operationAudit.nextActions.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">Tudo pronto para operar sem pendência crítica.</p>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {data.operationAudit.nextActions.map((item) => (
                        <div key={item.key} className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                          <strong className="block text-sm">{item.title}</strong>
                          <p className="mt-1 text-xs text-muted">{item.hint}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {showDesktopCommissions ? (
          <CommissionSummaryPanel
            commissionDueDays={commissionDueDays}
            commissionDueDaysDraft={commissionDueDaysDraft}
            setCommissionDueDaysDraft={setCommissionDueDaysDraft}
            canManageCommissionSettings={canManageCommissionSettings}
            savingCommissionSettings={savingCommissionSettings}
            closingCommissionScope={closingCommissionScope}
            syncingCommissions={syncingCommissions}
            totals={data.commission?.totals}
            formatCurrency={formatCurrency}
            formatShortDate={formatShortDate}
            onCloseDueCommissions={() => void closeDueCommissions()}
            onSyncHbxClientCommissions={() => void syncHbxClientCommissions()}
            onSaveCommissionSettings={() => void saveCommissionSettings()}
          >

            <HbxSection
              className="mt-4"
              eyebrow="Implantação HBX"
              title="Clientes aguardando ativação"
              description={`Quando o vendedor fecha um card, ele entra aqui. Avance para trial ou pagamento confirmado para liberar a comissão D+${commissionDueDays}.`}
              aside={<HbxStatusBadge dot={false}>{data.commission?.activationQueue?.length || 0} pendente(s)</HbxStatusBadge>}
            >

              {(data.commission?.activationQueue || []).length === 0 ? (
                <HbxEmptyState
                  title="Nenhum cliente aguardando implantação agora."
                  description="Clientes fechados por vendedores aparecem aqui antes de liberar a comissão."
                />
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                  {(data.commission?.activationQueue || []).map((client) => {
                    const seller = data.users.find((user) => user.id === client.userId);
                    return (
                      <article key={client.leadId} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <div className="min-w-0">
                            <strong className="block truncate">{client.name || "Cliente sem nome"}</strong>
                            <span className="text-xs text-muted">
                              {salePlanLabel(client.salePlanKey)} · {formatCurrency(client.saleValue || 0)} · vendedor {seller ? userLabel(seller) : client.userId || "-"}
                            </span>
                          </div>
                          <span className={commissionActivationBadgeClass(client)}>{commissionActivationStageLabel(client)}</span>
                        </div>
                        <p className="mt-2 text-xs text-muted">{commissionActivationHint(client, commissionDueDays)}</p>
                        {client.commissionNote ? <p className="mt-1 text-xs text-muted">{client.commissionNote}</p> : null}
                        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                          <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                            <p className="text-xs text-muted">Valor</p>
                            <strong className="block text-sm">{formatCurrency(client.commissionAmount || 0)}</strong>
                          </div>
                          <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                            <p className="text-xs text-muted">E-mail</p>
                            <strong className="block text-sm truncate">{client.email || "-"}</strong>
                          </div>
                          <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                            <p className="text-xs text-muted">Cidade</p>
                            <strong className="block text-sm truncate">{client.city || "-"}</strong>
                          </div>
                          <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                            <p className="text-xs text-muted">Cadastro</p>
                            <strong className="block text-sm">{formatShortDate(client.commissionLinkedAt || client.updatedAt)}</strong>
                          </div>
                          <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                            <p className="text-xs text-muted">Comissão</p>
                            <strong className="block text-sm">{commissionStatusLabel(client.commissionStatus)}</strong>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={updatingActivationLeadId !== null}
                            onClick={() => void updateActivationStatus(client.leadId, "trial_started")}
                            className="btn btn-primary btn-sm"
                          >
                            {updatingActivationLeadId === `${client.leadId}:trial_started` ? "Atualizando..." : "Trial iniciado"}
                          </button>
                          <button
                            type="button"
                            disabled={updatingActivationLeadId !== null}
                            onClick={() => void updateActivationStatus(client.leadId, "sale_confirmed")}
                            className="btn btn-secondary btn-sm"
                          >
                            {updatingActivationLeadId === `${client.leadId}:sale_confirmed` ? "Atualizando..." : "Pagamento confirmado"}
                          </button>
                          <button
                            type="button"
                            disabled={updatingActivationLeadId !== null}
                            onClick={() => void updateActivationStatus(client.leadId, "canceled")}
                            className="btn btn-secondary btn-sm"
                          >
                            {updatingActivationLeadId === `${client.leadId}:canceled` ? "Atualizando..." : "Cancelar"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </HbxSection>

            <div className="mt-4 rounded-[16px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div>
                  <span className="badge badge-brand">Folha de pagamento</span>
                  <h3 className="mt-2 font-semibold">Quanto pagar para cada vendedor</h3>
                  <p className="mt-1 text-xs text-muted">
                    Use o valor liberado para pagar hoje. O valor a pagar inclui o que já existe, mas pode ainda estar aguardando D+{commissionDueDays}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={(data.commission?.payroll || []).length === 0}
                    onClick={() => void copyPayrollSummary()}
                    className="btn btn-secondary btn-sm"
                  >
                    Copiar resumo
                  </button>
                  <span className="badge badge-success">
                    {formatCurrency(data.commission?.totals.duePayableAmount || 0)} liberado
                  </span>
                </div>
              </div>

              {(data.commission?.payroll || []).length === 0 ? (
                <p className="mt-3 text-sm text-muted">Nenhum vendedor com comissão aberta na folha.</p>
              ) : (
                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {(data.commission?.payroll || []).map((row) => (
                    <article key={row.sellerUserId} className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="min-w-0">
                          <strong className="block truncate">{row.sellerName}</strong>
                          <span className="text-xs text-muted truncate">
                            {formatPercent(row.commissionPercent)} comissão · {row.assignedCards} card(s) · próx. {formatShortDate(row.nextDueAt)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={row.status === "due" ? "badge badge-danger" : row.status === "payable" ? "badge badge-success" : "badge"}>
                            {payrollStatusLabel(row.status)}
                          </span>
                          {row.duePayableAmount > 0 ? (
                            <button
                              type="button"
                              disabled={closingCommissionScope !== null}
                              onClick={() => void closeDueCommissions(row.sellerUserId)}
                              className="btn btn-primary btn-sm"
                            >
                              {closingCommissionScope === `seller:${row.sellerUserId}` ? "Fechando..." : "Pagar"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
                        <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                          <p className="text-xs text-muted">Liberado</p>
                          <strong className="block text-sm">{formatCurrency(row.duePayableAmount || 0)}</strong>
                        </div>
                        <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                          <p className="text-xs text-muted">A pagar</p>
                          <strong className="block text-sm">{formatCurrency(row.payableAmount || 0)}</strong>
                        </div>
                        <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                          <p className="text-xs text-muted">Herdada</p>
                          <strong className="block text-sm">{formatCurrency(row.inheritedAmount || 0)}</strong>
                        </div>
                        <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                          <p className="text-xs text-muted">Ativos</p>
                          <strong className="block text-sm">{row.activeClients}</strong>
                        </div>
                        <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-2">
                          <p className="text-xs text-muted">Aguard.</p>
                          <strong className="block text-sm">{row.pendingActivation}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
              {(data.commission?.sellers || []).length === 0 ? (
                <div className="xl:col-span-2 rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-sm text-muted">
                  Nenhum vendedor com carteira atribuída ainda. Distribua cards pelo Radar para começar a medir comissão.
                </div>
              ) : (
                (data.commission?.sellers || []).map((seller) => (
                  <article key={seller.userId} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{seller.name}</h3>
                        <p className="text-xs text-muted truncate">
                          {formatPercent(seller.commissionPercent)} comissão · {seller.assignedCards} card(s)
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {seller.duePayableAmount > 0 ? (
                          <button
                            type="button"
                            disabled={closingCommissionScope !== null}
                            onClick={() => void closeDueCommissions(seller.userId)}
                            className="btn btn-primary btn-sm"
                          >
                            {closingCommissionScope === `seller:${seller.userId}` ? "Fechando..." : "Fechar"}
                          </button>
                        ) : null}
                        <span className={seller.isActive ? "badge badge-success" : "badge badge-danger"}>
                          {seller.isActive ? "ATIVO" : "DESATIVADO"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-2">
                      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-muted">A pagar</p>
                        <strong className="block text-sm">{formatCurrency(seller.payableAmount || 0)}</strong>
                      </div>
                      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-muted">Liberado</p>
                        <strong className="block text-sm">{formatCurrency(seller.duePayableAmount || 0)}</strong>
                      </div>
                      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-muted">Recorrente</p>
                        <strong className="block text-sm">{formatCurrency(seller.recurringAmount || 0)}</strong>
                      </div>
                      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-muted">Herdada</p>
                        <strong className="block text-sm">{formatCurrency(seller.inheritedAmount || 0)}</strong>
                      </div>
                      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-muted">Ativos</p>
                        <strong className="block text-sm">{seller.activeClients}</strong>
                      </div>
                      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-muted">Aguard.</p>
                        <strong className="block text-sm">{seller.pendingActivation}</strong>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {(seller.clients || []).slice(0, 3).map((client) => (
                        <div key={client.leadId} className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="min-w-0">
                              <strong className="block truncate">{client.name || "Cliente sem nome"}</strong>
                              <span className="text-xs text-muted">
                                {commissionClientSourceLabel(client)} · {commissionStatusLabel(client.commissionStatus)}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {client.isInherited ? <span className="badge badge-brand">Herdada</span> : null}
                              <span className="badge">{formatCurrency(client.commissionAmount || 0)}</span>
                              {client.commissionStatus === "payable" && !client.isRecurring && !client.isInherited ? (
                                <button
                                  type="button"
                                  disabled={markingCommissionLeadId === client.leadId}
                                  onClick={() => void markCommissionPaid(client.leadId)}
                                  className="btn btn-primary btn-sm"
                                >
                                  {markingCommissionLeadId === client.leadId ? "Baixando..." : "Pago"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="mt-4 rounded-[16px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Fechamentos recentes</h3>
                  <p className="text-xs text-muted">Histórico dos lotes baixados como pagos pelo Admin.</p>
                </div>
                <span className="badge">{data.commission?.totals.duePayableCount || 0} liberada(s)</span>
              </div>
              {(data.commission?.payouts || []).length === 0 ? (
                <p className="mt-3 text-sm text-muted">Nenhum fechamento de comissão registrado ainda.</p>
              ) : (
                <div className="mt-3 grid gap-2">
                  {(data.commission?.payouts || []).map((payout) => (
                    <div key={payout.id} className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="min-w-0">
                          <strong className="block truncate">{payout.sellerName || "Vendedor"}</strong>
                          <span className="text-xs text-muted">
                            {payout.referenceLabel || "Fechamento"} · {payout.leadCount} comissão(ões) · {formatDateTime(payout.paidAt || payout.createdAt)}
                          </span>
                        </div>
                        <span className="badge badge-success">{formatCurrency(payout.totalAmount || 0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CommissionSummaryPanel>
          ) : null}

          {showDesktopTeam || showDesktopModules ? (
          <TeamListPanel
            showDesktopTeam={showDesktopTeam}
            showDesktopModules={showDesktopModules}
            companyId={data.companyId}
            enabledModulesCount={enabledModules.length}
            usersCount={data.users.length}
            userSearch={userSearch}
            setUserSearch={setUserSearch}
            userFilter={userFilter}
            setUserFilter={setUserFilter}
            onCreateAccess={() => {
              resetCreateAccessPopup();
              setCreateAccessOpen(true);
            }}
            referralCandidatesPanel={renderReferralCandidatesPanel("desktop")}
          >

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-4">
              {filteredUsers.length === 0 ? (
                <div className="xl:col-span-2 rounded-[16px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-sm text-muted">
                  Nenhum usuário encontrado com estes filtros.
                </div>
              ) : filteredUsers.map((user) => {
                const role = normalizeRole(user.role, user.isSystemMaster);
                const isAdmin = role === "ADMIN";
                const isMaster = role === "USERMASTER";
                const isSeller = role === "USER";
                const showHbxNetwork = isHbxSellerNetwork && isSeller;
                const profileHasReferrer = showHbxNetwork && Boolean(profileDraft.referredByUserId);
                const editableReferrers = hbxReferrers.filter((referrer) => referrer.id !== user.id);
                const currentReferrerOption =
                  user.referredByUser && !editableReferrers.some((referrer) => referrer.id === user.referredByUser?.id)
                    ? user.referredByUser
                    : null;
                const userModules = moduleAccess?.users.find((item) => item.id === user.id)?.modules || [];
                const seatRank = activeSeatRankByUserId.get(user.id) || 0;
                const isExtraSeat = isSeller && user.isActive && seatRank > INCLUDED_TEAM_USERS;
                const seatLabel = isMaster
                  ? "Sem cobrança - USERMASTER"
                  : isAdmin
                  ? "Admin sem cobrança"
                  : !user.isActive
                  ? "Sem cobrança ativa"
                  : isExtraSeat
                    ? `Extra ${formatCurrency(EXTRA_USER_MONTHLY_PRICE)}/mês proporcional`
                    : "Vendedor incluído";
                const isEditingProfile = editingUserId === user.id;

                return (
                  <article
                    key={user.id}
                    className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 grid gap-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-[var(--brand)] text-sm font-bold text-white">
                          {userInitial(user)}
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate">{userLabel(user)}</h3>
                          <p className="text-xs text-muted truncate">{user.email || "sem e-mail"}</p>
                          <p className="text-xs text-muted truncate">Login: {user.username || "-"}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={isAdmin || isMaster ? "badge badge-brand" : "badge"}>{roleLabel(role, user.isSystemMaster)}</span>
                        <span className={user.isActive ? "badge badge-success" : "badge badge-danger"}>
                          {user.isActive ? "ATIVO" : "DESATIVADO"}
                        </span>
                        <span className={isExtraSeat ? "badge" : "badge badge-brand"}>{seatLabel}</span>
                      </div>
                    </div>

                    {showDesktopTeam ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="min-w-0 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-muted">WhatsApp</p>
                        <strong className="mt-1 block text-sm truncate">{userPhoneLabel(user)}</strong>
                      </div>
                      <div className="min-w-0 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-muted">Comissão</p>
                        <strong className="mt-1 block text-sm">{formatPercent(user.commissionPercent)}</strong>
                      </div>
                      <div className="min-w-0 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-muted">Vendedor</p>
                        <strong className="mt-1 block text-sm">{isMaster ? "Master" : isAdmin ? "Admin" : seatRank || "-"}</strong>
                      </div>
                    </div>
                    ) : null}

                    {showDesktopTeam && showHbxNetwork ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                        <div className="min-w-0 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                          <p className="text-xs text-muted">Rede HBX</p>
                          <strong className="mt-1 block text-sm">
                            {user.isActive ? "Indica" : "Inativo"}
                          </strong>
                        </div>
                        <div className="min-w-0 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                          <p className="text-xs text-muted">Herança que recebe</p>
                          <strong className="mt-1 block text-sm">{formatPercent(user.sellerReferralCommissionPercent)}</strong>
                        </div>
                        <div className="min-w-0 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                          <p className="text-xs text-muted">Indicado por</p>
                          <strong className="mt-1 block text-sm truncate">{referralUserLabel(user.referredByUser)}</strong>
                        </div>
                        <div className="min-w-0 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                          <p className="text-xs text-muted">Herança do indicador</p>
                          <strong className="mt-1 block text-sm">
                            {user.referredByUserId ? formatPercent(user.referredByCommissionPercentSnapshot) : "-"}
                          </strong>
                        </div>
                      </div>
                    ) : null}

                    {showDesktopTeam && !user.isActive ? (
                      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3 text-xs text-muted">
                        Histórico preservado por 730 dias. {retentionLabel(user.retentionUntil) || ""}
                      </div>
                    ) : null}

                    {showDesktopTeam ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={deletingUserId === user.id || changingUserId === user.id || !user.isActive || role === "USER"}
                        onClick={() => setRole(user.id, "USER")}
                        className="btn btn-secondary btn-sm"
                      >
                        Tornar vendedor
                      </button>
                      <button
                        type="button"
                        disabled={deletingUserId === user.id || changingUserId === user.id || !user.isActive || role === "ADMIN"}
                        onClick={() => setRole(user.id, "ADMIN")}
                        className="btn btn-primary btn-sm"
                      >
                        Tornar admin
                      </button>
                      <button
                        type="button"
                        disabled={deletingUserId === user.id || togglingActiveUserId === user.id}
                        onClick={() => {
                          if (!user.isActive && showHbxNetwork) void openSellerCadastroPopup(user);
                          else toggleActive(user.id, Boolean(user.isActive));
                        }}
                        className={`btn btn-sm ${user.isActive ? "btn-secondary" : "btn-primary"}`}
                      >
                        {user.isActive ? "Desativar" : isHbxSellerNetwork && isSeller ? "Liberar parceiro" : "Reativar"}
                      </button>
                      <button
                        type="button"
                        disabled={deletingUserId === user.id || savingProfileUserId === user.id}
                        onClick={() => {
                          if (showHbxNetwork) void openSellerCadastroPopup(user);
                          else startEditingProfile(user);
                        }}
                        className="btn btn-ghost btn-sm"
                      >
                        Editar dados
                      </button>
                      <button
                        type="button"
                        disabled={deletingUserId === user.id}
                        onClick={() => void deleteUser(user)}
                        className="btn btn-ghost btn-sm text-danger"
                      >
                        {deletingUserId === user.id ? "Excluindo..." : "Excluir"}
                      </button>
                    </div>
                    ) : null}

                    {showDesktopTeam && isEditingProfile && !showHbxNetwork ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveUserProfile(user);
                        }}
                        className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3 grid grid-cols-1 md:grid-cols-3 gap-3"
                      >
                        <label className="grid gap-1 text-sm">
                          <span className="font-medium">Nome</span>
                          <input
                            type="text"
                            value={profileDraft.name}
                            onChange={(event) => setProfileDraft((draft) => ({ ...draft, name: event.target.value }))}
                            className="field"
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="font-medium">WhatsApp</span>
                          <input
                            type="tel"
                            value={profileDraft.phone}
                            onChange={(event) => setProfileDraft((draft) => ({ ...draft, phone: event.target.value }))}
                            className="field"
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="font-medium">Comissão %</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            disabled={profileHasReferrer}
                            value={profileDraft.commissionPercent}
                            onChange={(event) =>
                              setProfileDraft((draft) => ({ ...draft, commissionPercent: event.target.value }))
                            }
                            className="field disabled:opacity-60"
                          />
                        </label>
                        {showHbxNetwork ? (
                          <div className="md:col-span-3 rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                              <div className="min-w-0">
                                <span className="badge badge-brand">Rede HBX</span>
                                <p className="mt-2 text-sm font-semibold">Indicação e comissão herdada</p>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                              <label className="grid gap-1 text-sm">
                                <span className="font-medium">Herança que recebe</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  disabled={profileHasReferrer}
                                  value={profileDraft.sellerReferralCommissionPercent}
                                  onChange={(event) =>
                                    setProfileDraft((draft) => ({
                                      ...draft,
                                      sellerReferralCommissionPercent: event.target.value,
                                    }))
                                  }
                                  className="field disabled:opacity-60"
                                />
                              </label>
                              <label className="grid gap-1 text-sm">
                                <span className="font-medium">Indicado por</span>
                                <select
                                  value={profileDraft.referredByUserId}
                                  onChange={(event) => {
                                    const selectedReferrerId = event.target.value;
                                    const selectedReferrer = hbxReferrers.find((referrer) => String(referrer.id) === selectedReferrerId);
                                    setProfileDraft((draft) => ({
                                      ...draft,
                                      referredByUserId: selectedReferrerId,
                                      commissionPercent: selectedReferrer ? percentInputValue(selectedReferrer.commissionPercent) : draft.commissionPercent,
                                      sellerReferralCommissionPercent: selectedReferrer ? percentInputValue(selectedReferrer.sellerReferralCommissionPercent) : draft.sellerReferralCommissionPercent,
                                      referredByCommissionPercentSnapshot: selectedReferrerId
                                        ? percentInputValue(selectedReferrer?.sellerReferralCommissionPercent || user.referredByCommissionPercentSnapshot || 0)
                                        : "0",
                                    }));
                                  }}
                                  className="field"
                                >
                                  <option value="">Direto HBX</option>
                                  {currentReferrerOption ? (
                                    <option value={currentReferrerOption.id}>
                                      {referralUserLabel(currentReferrerOption)}
                                    </option>
                                  ) : null}
                                  {editableReferrers.map((referrer) => (
                                    <option key={referrer.id} value={referrer.id}>
                                      {userLabel(referrer)} · herança {formatPercent(referrer.sellerReferralCommissionPercent)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="grid gap-1 text-sm">
                                <span className="font-medium">Herança do indicador</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={profileDraft.referredByCommissionPercentSnapshot}
                                  onChange={(event) =>
                                    setProfileDraft((draft) => ({
                                      ...draft,
                                      referredByCommissionPercentSnapshot: event.target.value,
                                    }))
                                  }
                                  disabled
                                  className="field disabled:opacity-60"
                                />
                              </label>
                            </div>
                            {profileHasReferrer ? (
                              <p className="mt-3 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3 text-xs text-muted">
                                Comissão normal e herança deste vendedor seguem o indicador selecionado. O backend recalcula no salvamento.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="md:col-span-3 flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingUserId(null)}
                            className="btn btn-secondary btn-sm"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={savingProfileUserId === user.id}
                            className="btn btn-primary btn-sm"
                          >
                            {savingProfileUserId === user.id ? "Salvando..." : "Salvar dados"}
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {showDesktopModules ? (
                    <div className="grid gap-2">
                      <p className="text-xs font-semibold uppercase text-muted">Módulos</p>
                      {isAdmin ? (
                        <p className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-muted">
                          Admin tem acesso total aos módulos liberados pelo plano da empresa.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {enabledModules.length === 0 ? (
                            <span className="text-sm text-muted">Nenhum módulo liberado para a empresa.</span>
                          ) : (
                            enabledModules.map((mod) => {
                              const row = userModules.find((item) => item.key === mod.key);
                              const moduleKey = normalizeModuleKey(mod.key);
                              const hbxSellerOperationalModule = showHbxNetwork && HBX_SELLER_OPERATIONAL_MODULE_KEYS.has(moduleKey);
                              const lockedForSeller = !hbxSellerOperationalModule && SELLER_LOCKED_MODULE_KEYS.has(moduleKey);
                              const workspaceModule = SELLER_WORKSPACE_MODULE_KEYS.has(moduleKey);
                              const allowed = hbxSellerOperationalModule || (!lockedForSeller && (row ? row.allowed : Boolean(mod.companyEnabled)));
                              return (
                                <button
                                  key={`${user.id}-${mod.key}`}
                                  type="button"
                                  disabled={hbxSellerOperationalModule || lockedForSeller || savingModuleUserId === user.id || !user.isActive}
                                  onClick={() => toggleUserModule(user.id, mod.key)}
                                  className={`btn btn-sm ${
                                    lockedForSeller
                                      ? "btn-secondary"
                                      : allowed && user.isActive
                                        ? "btn-primary"
                                        : workspaceModule
                                          ? "btn-secondary"
                                          : "btn-ghost"
                                  }`}
                                  title={
                                    hbxSellerOperationalModule
                                      ? "Módulo padrão do parceiro HBX"
                                      : lockedForSeller
                                        ? "Perfil vendedor não acessa este módulo"
                                        : "Clique para alternar"
                                  }
                                >
                                  {moduleLabel(mod)}: {hbxSellerOperationalModule ? "ON padrão" : lockedForSeller ? "bloqueado" : allowed && user.isActive ? "ON" : "OFF"}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </TeamListPanel>
          ) : null}

          {showDesktopSignals ? (
          <section className="metrics-grid">
            <article className="stat-card">
              <p className="stat-card__label">Conversas</p>
              <p className="stat-card__value">{data.totals.conversations}</p>
            </article>
            <article className="stat-card">
              <p className="stat-card__label">Mensagens</p>
              <p className="stat-card__value">{data.totals.messages}</p>
            </article>
            <article className="stat-card">
              <p className="stat-card__label">Reclamações</p>
              <p className="stat-card__value">{data.totals.complaints ?? 0}</p>
            </article>
            <article className="stat-card">
              <p className="stat-card__label">Inbound</p>
              <p className="stat-card__value">{data.totals.inbound}</p>
            </article>
            <article className="stat-card">
              <p className="stat-card__label">Outbound</p>
              <p className="stat-card__value">{data.totals.outbound}</p>
            </article>
            <article className="stat-card">
              <p className="stat-card__label">Usuários</p>
              <p className="stat-card__value">{data.totals.users}</p>
            </article>
            <article className="stat-card">
              <p className="stat-card__label">Avaliações</p>
              <p className="stat-card__value">{data.totals.surveys}</p>
            </article>
          </section>
          ) : null}

          {showDesktopSignals ? (
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <article className="panel p-4">
              <h2 className="text-lg font-semibold">Mensagens recentes</h2>
              <div className="space-y-2 max-h-[420px] overflow-auto pr-1 mt-3">
                {topMessages.length === 0 ? (
                  <p className="text-sm text-muted">Sem mensagens recentes.</p>
                ) : (
                  topMessages.map((message) => (
                    <div
                      key={message.id}
                      className="border border-[var(--line)] rounded-[12px] p-3 text-sm bg-[var(--surface-soft)]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="badge">{message.direction}</span>
                        <span className="badge">{message.status}</span>
                        {message.isComplaint ? <span className="badge badge-danger">RECLAMACAO</span> : null}
                      </div>
                      <p className="mt-2 break-words">{message.body}</p>
                      <p className="text-xs text-muted mt-2">
                        {message.conversation?.contact || "sem contato"} |{" "}
                        {new Date(message.timestamp).toLocaleString()}
                      </p>
                      <div className="mt-2">
                        <button
                          disabled={togglingMessageId === message.id}
                          onClick={() => toggleComplaint(message.id, message.isComplaint)}
                          className={`btn btn-ghost btn-sm ${message.isComplaint ? "text-danger" : ""}`}
                        >
                          {message.isComplaint ? "Remover reclamacao" : "Marcar reclamacao"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="panel p-4">
              <h2 className="text-lg font-semibold">Avaliacoes de clientes</h2>
              <div className="space-y-2 max-h-[420px] overflow-auto pr-1 mt-3">
                {topSurveys.length === 0 ? (
                  <p className="text-sm text-muted">Sem avaliacoes registradas.</p>
                ) : (
                  topSurveys.map((survey) => (
                    <div
                      key={survey.id}
                      className="border border-[var(--line)] rounded-[12px] p-3 text-sm bg-[var(--surface-soft)]"
                    >
                      <p className="font-semibold">Nota: {survey.rating ?? "N/A"}</p>
                      <p className="mt-1 break-words">{survey.feedback || "Sem comentario"}</p>
                      <p className="text-xs text-muted mt-2">
                        {survey.customerName || survey.customerPhone || "cliente"} |{" "}
                        {new Date(survey.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>
          ) : null}
        </>
      )}
    </DashboardScaffold>
  );
}
