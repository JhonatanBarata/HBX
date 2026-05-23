"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "@/app/_lib/api";
import { startSmartPolling } from "@/app/_lib/polling";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";

type UserItem = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  commissionPercent?: number | null;
  role: string;
  isActive: boolean;
  deactivatedAt?: string | null;
  retentionUntil?: string | null;
  createdAt: string;
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

type GerencialOverview = {
  companyId: number;
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
  recentMessages: MessageItem[];
  surveys: SurveyItem[];
};

type CommissionClient = {
  leadId: string;
  userId?: number | null;
  name?: string | null;
  phone?: string | null;
  city?: string | null;
  saleStatus?: string | null;
  commissionStatus?: string | null;
  saleValue?: number | null;
  commissionAmount?: number | null;
  commissionDueAt?: string | null;
  commissionPaidAt?: string | null;
  commissionPayoutId?: string | null;
  recurringCycleKey?: string | null;
  isRecurring?: boolean | null;
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
  nextDueAt?: string | null;
  clients?: CommissionClient[];
};

type CommissionOverview = {
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
    nextDueAt?: string | null;
  };
  sellers: CommissionSellerSummary[];
  recentClients: CommissionClient[];
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
    role: string;
    isActive: boolean;
  };
  temporaryPassword?: string | null;
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
};

const CREATED_PASSWORD_STORAGE_KEY = "hbx.gerencial.created-password.v1";
const INCLUDED_TEAM_USERS = 2;
const EXTRA_USER_MONTHLY_PRICE = 24.9;
const SELLER_LOCKED_MODULE_KEYS = new Set(["webscraping", "gerencial", "financeiro", "cadastro", "website", "master", "exclusoes"]);
const SELLER_WORKSPACE_MODULE_KEYS = new Set(["vendas", "atendimento", "whatsapp"]);
const SELLER_ROLE_COPY = {
  USER: {
    label: "Vendedor",
    badge: "CRM",
    description: "Recebe oportunidades, trabalha no CRM e chama no WhatsApp. Sem Radar e sem gestão.",
  },
  ADMIN: {
    label: "Admin",
    badge: "Controle",
    description: "Gerencia equipe, módulos, Radar, plano e distribuição de oportunidades.",
  },
} as const;
type UserFilter = "active" | "sellers" | "admins" | "inactive" | "all";

function normalizeRole(role?: string | null): "USER" | "ADMIN" {
  return String(role || "").toUpperCase() === "ADMIN" ? "ADMIN" : "USER";
}

function normalizeModuleKey(key?: string | null) {
  return String(key || "").trim().toLowerCase();
}

function roleLabel(role?: string | null) {
  return SELLER_ROLE_COPY[normalizeRole(role)].label;
}

function roleDescription(role?: string | null) {
  return SELLER_ROLE_COPY[normalizeRole(role)].description;
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

function buildProfileDraft(user: UserItem): UserProfileDraft {
  return {
    name: user.name || "",
    phone: user.phone || "",
    commissionPercent: Number(user.commissionPercent || 0).toLocaleString("pt-BR", {
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

function commissionStatusLabel(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "pending") return "Pendente";
  if (normalized === "payable") return "A pagar";
  if (normalized === "paid") return "Pago";
  if (normalized === "canceled") return "Cancelado";
  return "Sem comissão";
}

function formatShortDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
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

export default function GerencialClientPage() {
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
  const [newUserRole, setNewUserRole] = useState<"USER" | "ADMIN">("USER");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [createdPasswordInfo, setCreatedPasswordInfo] = useState<CreatedPasswordInfo | null>(() =>
    loadCreatedPasswordInfo(),
  );
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [togglingMessageId, setTogglingMessageId] = useState<number | null>(null);
  const [moduleAccess, setModuleAccess] = useState<CompanyAccessPayload | null>(null);
  const [savingModuleUserId, setSavingModuleUserId] = useState<number | null>(null);
  const [togglingActiveUserId, setTogglingActiveUserId] = useState<number | null>(null);
  const [markingCommissionLeadId, setMarkingCommissionLeadId] = useState<string | null>(null);
  const [syncingCommissions, setSyncingCommissions] = useState(false);
  const [closingCommissionScope, setClosingCommissionScope] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<UserFilter>("active");
  const [userSearch, setUserSearch] = useState("");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [savingProfileUserId, setSavingProfileUserId] = useState<number | null>(null);
  const [profileDraft, setProfileDraft] = useState<UserProfileDraft>({
    name: "",
    phone: "",
    commissionPercent: "0",
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [payload, access] = await Promise.all([
        apiFetch<GerencialOverview>("/gerencial/overview"),
        apiFetch<CompanyAccessPayload>("/modules/company/access"),
      ]);
      setData((prev) => ({
        ...payload,
        users: stableUserOrder(prev?.users, payload.users || []),
      }));
      setModuleAccess(access);
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
          users: prev.users.map((u) => (u.id === userId ? { ...u, role } : u)),
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
              return {
                ...m,
                allowed: SELLER_LOCKED_MODULE_KEYS.has(moduleKey)
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
          "Funcionário desativado com sucesso, manteremos histórico por 730 Dias",
      );
    } catch (activeError) {
      setError(friendlyGerencialError(activeError, "Falha ao atualizar status do funcionário."));
    } finally {
      setTogglingActiveUserId(null);
    }
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

  async function createCompanyUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const email = newUserEmail.trim().toLowerCase();
    if (!email) {
      setError("Informe um e-mail válido.");
      return;
    }
    const commissionPercent = parsePercentInput(newUserCommissionPercent);
    if (commissionPercent === null) {
      setError("Informe uma comissão entre 0 e 100.");
      return;
    }

    setCreatingUser(true);
    try {
      const payload = await apiFetch<CreateCompanyUserResult>("/users/company/create", {
        method: "POST",
        body: JSON.stringify({
          email,
          name: newUserName.trim() || undefined,
          phone: newUserPhone.trim() || undefined,
          commissionPercent,
          role: newUserRole,
          password: newUserPassword.trim() || undefined,
        }),
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
        setActionInfo(`${roleLabel(payload.user.role)} criado. Entregue a senha temporária com segurança.`);
      } else {
        setActionInfo(`${roleLabel(payload.user.role)} criado com senha definida manualmente.`);
      }

      setNewUserEmail("");
      setNewUserName("");
      setNewUserPhone("");
      setNewUserCommissionPercent("");
      setNewUserRole("USER");
      setNewUserPassword("");
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

    setSavingProfileUserId(user.id);
    setError(null);
    try {
      const updated = await apiFetch<Pick<UserItem, "id" | "name" | "phone" | "commissionPercent">>(`/users/${user.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          name: profileDraft.name,
          phone: profileDraft.phone,
          commissionPercent,
        }),
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

  const topMessages = useMemo(() => data?.recentMessages?.slice(0, 20) ?? [], [data]);
  const topSurveys = useMemo(() => data?.surveys?.slice(0, 20) ?? [], [data]);
  const enabledModules = useMemo(
    () => (moduleAccess?.modules || []).filter((mod) => mod.companyEnabled),
    [moduleAccess],
  );
  const teamStats = useMemo(() => {
    const users = data?.users || [];
    const active = users.filter((user) => user.isActive);
    const admins = users.filter((user) => normalizeRole(user.role) === "ADMIN");
    const sellers = users.filter((user) => normalizeRole(user.role) === "USER");
    const activeSellers = sellers.filter((user) => user.isActive);
    const inactive = users.filter((user) => !user.isActive);
    const extraSeats = Math.max(0, active.length - INCLUDED_TEAM_USERS);
    const commissionConfigured = sellers.filter((user) => Number(user.commissionPercent || 0) > 0).length;
    const averageCommission =
      activeSellers.length > 0
        ? activeSellers.reduce((total, user) => total + Number(user.commissionPercent || 0), 0) / activeSellers.length
        : 0;
    return {
      active: active.length,
      admins: admins.length,
      sellers: sellers.length,
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
      .filter((user) => user.isActive)
      .forEach((user, index) => ranks.set(user.id, index + 1));
    return ranks;
  }, [data?.users]);
  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();
    return (data?.users || []).filter((user) => {
      const role = normalizeRole(user.role);
      const matchesFilter =
        userFilter === "all" ||
        (userFilter === "active" && user.isActive) ||
        (userFilter === "inactive" && !user.isActive) ||
        (userFilter === "admins" && role === "ADMIN") ||
        (userFilter === "sellers" && role === "USER");
      if (!matchesFilter) return false;
      if (!search) return true;
      return [userLabel(user), user.email, user.username, user.phone, roleLabel(role)]
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

  function retentionLabel(retentionUntil?: string | null) {
    if (!retentionUntil) return null;
    const ms = new Date(retentionUntil).getTime() - Date.now();
    const days = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
    return `${days} dias restantes para retenção`;
  }

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

  return (
    <DashboardScaffold
      title="Gerencial"
      description="Cadastro de vendedores, permissões administrativas e controle de acesso por módulo."
      actions={
        <button type="button" onClick={load} className="btn btn-primary btn-sm">
          Atualizar dados
        </button>
      }
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      {actionInfo ? <div className="msg-info"><div className="text-sm">{actionInfo}</div></div> : null}

      {!data ? (
        <div className="panel p-4 text-sm text-muted">{loading ? "Carregando..." : "Sem dados."}</div>
      ) : (
        <>
          <section className="panel p-4 md:p-5 rounded-[20px]">
            <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
              <div className="min-w-0">
                <span className="badge badge-brand">Fase 2</span>
                <h2 className="mt-3 text-xl font-semibold">Gerencial vira equipe comercial.</h2>
                <p className="mt-2 text-sm text-muted max-w-3xl">
                  Cadastre vendedores, deixe telefone e comissão prontos, acompanhe assentos incluídos e mantenha
                  Radar, Gerencial e Cadastros sob controle do ADMIN.
                </p>
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                  <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                    <p className="text-xs text-muted">Ativos</p>
                    <strong className="mt-1 block text-2xl">{teamStats.active}</strong>
                  </article>
                  <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                    <p className="text-xs text-muted">Vendedores</p>
                    <strong className="mt-1 block text-2xl">{teamStats.sellers}</strong>
                  </article>
                  <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                    <p className="text-xs text-muted">Admins</p>
                    <strong className="mt-1 block text-2xl">{teamStats.admins}</strong>
                  </article>
                  <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                    <p className="text-xs text-muted">Inativos</p>
                    <strong className="mt-1 block text-2xl">{teamStats.inactive}</strong>
                  </article>
                  <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                    <p className="text-xs text-muted">Extras</p>
                    <strong className="mt-1 block text-2xl">{teamStats.extraSeats}</strong>
                  </article>
                  <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                    <p className="text-xs text-muted">Custo equipe</p>
                    <strong className="mt-1 block text-lg">{formatCurrency(teamStats.teamMonthlyExtra)}</strong>
                  </article>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
                <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                  <span className="badge">{SELLER_ROLE_COPY.USER.badge}</span>
                  <strong className="mt-2 block text-sm">{SELLER_ROLE_COPY.USER.label}</strong>
                  <p className="mt-1 text-xs text-muted">{SELLER_ROLE_COPY.USER.description}</p>
                </article>
                <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                  <span className="badge badge-brand">{SELLER_ROLE_COPY.ADMIN.badge}</span>
                  <strong className="mt-2 block text-sm">{SELLER_ROLE_COPY.ADMIN.label}</strong>
                  <p className="mt-1 text-xs text-muted">{SELLER_ROLE_COPY.ADMIN.description}</p>
                </article>
                <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3 sm:col-span-2 xl:col-span-1">
                  <span className="badge">Assentos</span>
                  <strong className="mt-2 block text-sm">
                    {teamStats.includedSeats} incluídos, {formatCurrency(EXTRA_USER_MONTHLY_PRICE)} por extra
                  </strong>
                  <p className="mt-1 text-xs text-muted">
                    Comissão média ativa: {formatPercent(teamStats.averageCommission)}; {teamStats.commissionConfigured} vendedores configurados.
                  </p>
                </article>
              </div>
            </div>
          </section>

          <section className="panel p-4 md:p-5 rounded-[20px]">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Cadastrar vendedor ou admin</h2>
                <p className="mt-1 text-sm text-muted">O login usa o e-mail. Se deixar senha vazia, o HBX gera uma senha temporária.</p>
              </div>
              <span className="badge">ADMIN / MASTER</span>
            </div>

            <form onSubmit={createCompanyUser} className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Nome do funcionário</span>
                <input
                  type="text"
                  placeholder="Ex.: João Silva"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="field"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">E-mail</span>
                <input
                  type="email"
                  placeholder="email@empresa.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="field"
                  required
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">WhatsApp do vendedor</span>
                <input
                  type="tel"
                  placeholder="(11) 90000-0000"
                  value={newUserPhone}
                  onChange={(e) => setNewUserPhone(e.target.value)}
                  className="field"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Comissão padrão</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex.: 10"
                  value={newUserCommissionPercent}
                  onChange={(e) => setNewUserCommissionPercent(e.target.value)}
                  className="field"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Senha opcional</span>
                <input
                  type="password"
                  placeholder="Gerar senha temporária"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="field"
                />
              </label>
              <div className="grid gap-1 text-sm">
                <span className="font-medium">Perfil inicial</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(["USER", "ADMIN"] as const).map((role) => (
                    <button
                      key={role}
                      type="button"
                      aria-pressed={newUserRole === role}
                      onClick={() => setNewUserRole(role)}
                      className={`rounded-[14px] border p-3 text-left transition ${
                        newUserRole === role
                          ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                          : "border-[var(--line)] bg-[var(--surface-soft)]"
                      }`}
                    >
                      <span className={role === "ADMIN" ? "badge badge-brand" : "badge"}>{roleLabel(role)}</span>
                      <strong className="mt-2 block text-sm">{role === "USER" ? "Vender no CRM" : "Controlar equipe"}</strong>
                      <small className="mt-1 block text-xs text-muted">{roleDescription(role)}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="md:col-span-2 xl:col-span-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{newUserRole === "USER" ? "Acesso de vendedor" : "Acesso administrativo"}</p>
                  <p className="mt-1 text-xs text-muted">
                    {newUserRole === "USER"
                      ? "Vendas e Atendimento/WhatsApp ficam liberados quando a empresa tiver esses módulos. Comissão e telefone ficam prontos no CRM."
                      : "Admin pode cadastrar equipe, controlar módulos, acessar Gerencial e operar Radar conforme o plano."}
                  </p>
                </div>
                <button type="submit" disabled={creatingUser} className="btn btn-primary btn-sm">
                  {creatingUser ? "Criando..." : newUserRole === "USER" ? "Criar vendedor" : "Criar admin"}
                </button>
              </div>
            </form>
          </section>

          {createdPasswordInfo ? (
            <section className="panel p-4 rounded-[20px] border-[var(--line)]">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0">
                  <span className="badge badge-success">Usuário criado</span>
                  <h2 className="mt-2 text-lg font-semibold">Senha temporária de {createdPasswordInfo.userLabel}</h2>
                  <p className="mt-1 text-sm text-muted">Guarde esta senha antes de fechar este aviso.</p>
                  <code className="mt-3 block w-fit max-w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2 text-sm break-all">
                    {createdPasswordInfo.password}
                  </code>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary btn-sm" onClick={copyTemporaryPassword}>
                    Copiar senha
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={dismissCreatedPasswordInfo}>
                    Fechar
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <section className="panel p-4 md:p-5 rounded-[20px]">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <span className="badge badge-brand">Fase 6</span>
                <h2 className="mt-2 text-lg font-semibold">Comissões e carteira dos vendedores</h2>
                <p className="mt-1 text-sm text-muted">
                  O HBX sincroniza clientes, separa vencidos em D+3 úteis e fecha lotes de pagamento por vendedor.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={closingCommissionScope !== null || (data.commission?.totals.duePayableAmount || 0) <= 0}
                  onClick={() => void closeDueCommissions()}
                  className="btn btn-primary btn-sm"
                >
                  {closingCommissionScope === "all" ? "Fechando..." : "Fechar vencidas"}
                </button>
                <button
                  type="button"
                  disabled={syncingCommissions}
                  onClick={() => void syncHbxClientCommissions()}
                  className="btn btn-secondary btn-sm"
                >
                  {syncingCommissions ? "Sincronizando..." : "Sincronizar HBX"}
                </button>
                <span className="badge">D+3 úteis</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
              <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                <p className="text-xs text-muted">A pagar</p>
                <strong className="mt-1 block text-lg">{formatCurrency(data.commission?.totals.payableAmount || 0)}</strong>
              </article>
              <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                <p className="text-xs text-muted">Vencido</p>
                <strong className="mt-1 block text-lg">{formatCurrency(data.commission?.totals.duePayableAmount || 0)}</strong>
              </article>
              <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                <p className="text-xs text-muted">Recorrente</p>
                <strong className="mt-1 block text-lg">{formatCurrency(data.commission?.totals.recurringAmount || 0)}</strong>
              </article>
              <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                <p className="text-xs text-muted">Ativos</p>
                <strong className="mt-1 block text-2xl">{data.commission?.totals.activeClients || 0}</strong>
              </article>
              <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                <p className="text-xs text-muted">Aguardando</p>
                <strong className="mt-1 block text-2xl">{data.commission?.totals.pendingActivation || 0}</strong>
              </article>
              <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                <p className="text-xs text-muted">Inativados</p>
                <strong className="mt-1 block text-2xl">{data.commission?.totals.inactiveClients || 0}</strong>
              </article>
              <article className="rounded-[14px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                <p className="text-xs text-muted">Próximo pagto</p>
                <strong className="mt-1 block text-lg">{formatShortDate(data.commission?.totals.nextDueAt)}</strong>
              </article>
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
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
                      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-muted">A pagar</p>
                        <strong className="block text-sm">{formatCurrency(seller.payableAmount || 0)}</strong>
                      </div>
                      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-muted">Vencido</p>
                        <strong className="block text-sm">{formatCurrency(seller.duePayableAmount || 0)}</strong>
                      </div>
                      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <p className="text-xs text-muted">Recorrente</p>
                        <strong className="block text-sm">{formatCurrency(seller.recurringAmount || 0)}</strong>
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
                                {client.isRecurring
                                  ? `Recorrente ${client.recurringCycleKey || ""}`.trim()
                                  : saleStatusLabel(client.saleStatus)} · {commissionStatusLabel(client.commissionStatus)}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="badge">{formatCurrency(client.commissionAmount || 0)}</span>
                              {client.commissionStatus === "payable" && !client.isRecurring ? (
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
                <span className="badge">{data.commission?.totals.duePayableCount || 0} vencida(s)</span>
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
          </section>

          <section className="panel p-4 md:p-5 rounded-[20px]">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Equipe da empresa #{data.companyId}</h2>
                <p className="mt-1 text-sm text-muted">Altere perfil, status e módulos sem perder o histórico da operação.</p>
              </div>
              <span className="badge badge-brand">{data.users.length} pessoas</span>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Buscar na equipe</span>
                <input
                  type="search"
                  placeholder="Nome, e-mail ou login"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  className="field"
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                {([
                  ["active", "Ativos"],
                  ["sellers", "Vendedores"],
                  ["admins", "Admins"],
                  ["inactive", "Inativos"],
                  ["all", "Todos"],
                ] as Array<[UserFilter, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setUserFilter(value)}
                    className={`btn btn-sm ${userFilter === value ? "btn-primary" : "btn-secondary"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-4">
              {filteredUsers.length === 0 ? (
                <div className="xl:col-span-2 rounded-[16px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-sm text-muted">
                  Nenhum funcionário encontrado com estes filtros.
                </div>
              ) : filteredUsers.map((user) => {
                const role = normalizeRole(user.role);
                const isAdmin = role === "ADMIN";
                const userModules = moduleAccess?.users.find((item) => item.id === user.id)?.modules || [];
                const seatRank = activeSeatRankByUserId.get(user.id) || 0;
                const isExtraSeat = user.isActive && seatRank > INCLUDED_TEAM_USERS;
                const seatLabel = !user.isActive
                  ? "Sem cobrança ativa"
                  : isExtraSeat
                    ? `Extra ${formatCurrency(EXTRA_USER_MONTHLY_PRICE)}/mês`
                    : "Incluído no plano";
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
                        <span className={isAdmin ? "badge badge-brand" : "badge"}>{roleLabel(role)}</span>
                        <span className={user.isActive ? "badge badge-success" : "badge badge-danger"}>
                          {user.isActive ? "ATIVO" : "DESATIVADO"}
                        </span>
                        <span className={isExtraSeat ? "badge" : "badge badge-brand"}>{seatLabel}</span>
                      </div>
                    </div>

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
                        <p className="text-xs text-muted">Assento</p>
                        <strong className="mt-1 block text-sm">{seatRank || "-"}</strong>
                      </div>
                    </div>

                    {!user.isActive ? (
                      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3 text-xs text-muted">
                        Histórico preservado por 730 dias. {retentionLabel(user.retentionUntil) || ""}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={changingUserId === user.id || !user.isActive || role === "USER"}
                        onClick={() => setRole(user.id, "USER")}
                        className="btn btn-secondary btn-sm"
                      >
                        Tornar vendedor
                      </button>
                      <button
                        type="button"
                        disabled={changingUserId === user.id || !user.isActive || role === "ADMIN"}
                        onClick={() => setRole(user.id, "ADMIN")}
                        className="btn btn-primary btn-sm"
                      >
                        Tornar admin
                      </button>
                      <button
                        type="button"
                        disabled={togglingActiveUserId === user.id}
                        onClick={() => toggleActive(user.id, Boolean(user.isActive))}
                        className={`btn btn-sm ${user.isActive ? "btn-secondary" : "btn-primary"}`}
                      >
                        {user.isActive ? "Desativar" : "Reativar"}
                      </button>
                      <button
                        type="button"
                        disabled={savingProfileUserId === user.id}
                        onClick={() => startEditingProfile(user)}
                        className="btn btn-ghost btn-sm"
                      >
                        Editar dados
                      </button>
                    </div>

                    {isEditingProfile ? (
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
                            value={profileDraft.commissionPercent}
                            onChange={(event) =>
                              setProfileDraft((draft) => ({ ...draft, commissionPercent: event.target.value }))
                            }
                            className="field"
                          />
                        </label>
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
                              const lockedForSeller = SELLER_LOCKED_MODULE_KEYS.has(moduleKey);
                              const workspaceModule = SELLER_WORKSPACE_MODULE_KEYS.has(moduleKey);
                              const allowed = !lockedForSeller && (row ? row.allowed : Boolean(mod.companyEnabled));
                              return (
                                <button
                                  key={`${user.id}-${mod.key}`}
                                  type="button"
                                  disabled={lockedForSeller || savingModuleUserId === user.id || !user.isActive}
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
                                  title={lockedForSeller ? "Perfil vendedor não acessa este módulo" : "Clique para alternar"}
                                >
                                  {moduleLabel(mod)}: {lockedForSeller ? "bloqueado" : allowed && user.isActive ? "ON" : "OFF"}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

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
        </>
      )}
    </DashboardScaffold>
  );
}
