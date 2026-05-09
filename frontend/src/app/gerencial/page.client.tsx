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
  recentMessages: MessageItem[];
  surveys: SurveyItem[];
};

type CreateCompanyUserResult = {
  user: {
    id: number;
    email?: string | null;
    username?: string | null;
    name?: string | null;
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

const CREATED_PASSWORD_STORAGE_KEY = "hbx.gerencial.created-password.v1";

function normalizeRole(role?: string | null): "USER" | "ADMIN" {
  return String(role || "").toUpperCase() === "ADMIN" ? "ADMIN" : "USER";
}

function userLabel(user: Pick<UserItem, "id" | "name" | "username" | "email">) {
  return user.name || user.username || user.email || `Usuário #${user.id}`;
}

function userInitial(user: Pick<UserItem, "id" | "name" | "username" | "email">) {
  return userLabel(user).trim().charAt(0).toUpperCase() || "U";
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
          // Non-admin -> default to companyEnabled for each module
          return {
            ...u,
            modules: u.modules.map((m) => {
              const companyMod = prev.modules.find((cm) => cm.key === m.key);
              return {
                ...m,
                allowed: companyMod ? Boolean(companyMod.companyEnabled) : m.allowed,
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

    setCreatingUser(true);
    try {
      const payload = await apiFetch<CreateCompanyUserResult>("/users/company/create", {
        method: "POST",
        body: JSON.stringify({
          email,
          name: newUserName.trim() || undefined,
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
      } else {
        setActionInfo("Usuário criado com senha definida manualmente.");
      }

      setNewUserEmail("");
      setNewUserName("");
      setNewUserRole("USER");
      setNewUserPassword("");
      await load();
    } catch (createError) {
      setError(friendlyGerencialError(createError, "Falha ao cadastrar usuário."));
    } finally {
      setCreatingUser(false);
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

  const topMessages = useMemo(() => data?.recentMessages?.slice(0, 20) ?? [], [data]);
  const topSurveys = useMemo(() => data?.surveys?.slice(0, 20) ?? [], [data]);
  const enabledModules = useMemo(
    () => (moduleAccess?.modules || []).filter((mod) => mod.companyEnabled),
    [moduleAccess],
  );

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
      title="Equipe e Usuários"
      description="Crie atendentes, defina ADMIN/USER, controle acessos e mantenha o histórico da empresa."
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
            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
              <div className="min-w-0">
                <span className="badge badge-brand">Gestão da equipe</span>
                <h2 className="mt-3 text-xl font-semibold">Perfis simples para operar com segurança</h2>
                <p className="mt-2 text-sm text-muted max-w-3xl">
                  ADMIN gerencia a equipe e USER usa o sistema sem alterar permissões. Ao desativar alguém,
                  o histórico continua preservado por 730 dias.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2">
                <article className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                  <strong className="text-sm">ADMIN</strong>
                  <p className="mt-1 text-xs text-muted">Pode criar usuários, trocar permissões e ver o gerencial.</p>
                </article>
                <article className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                  <strong className="text-sm">USER</strong>
                  <p className="mt-1 text-xs text-muted">Usa o sistema, mas não gerencia equipe.</p>
                </article>
                <article className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                  <strong className="text-sm">Retenção</strong>
                  <p className="mt-1 text-xs text-muted">Usuário desativado mantém histórico por 730 dias.</p>
                </article>
              </div>
            </div>
          </section>

          <section className="panel p-4 md:p-5 rounded-[20px]">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Cadastrar novo usuário</h2>
                <p className="mt-1 text-sm text-muted">Se deixar senha vazia, o HBX gera uma senha temporária.</p>
              </div>
              <span className="badge">Apenas ADMIN</span>
            </div>

            <form onSubmit={createCompanyUser} className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Nome</span>
                <input
                  type="text"
                  placeholder="Nome do atendente"
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
                <span className="font-medium">Perfil</span>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as "USER" | "ADMIN")}
                  className="field"
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
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
              <div className="md:col-span-2 xl:col-span-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-xs text-muted">USER não acessa esta gestão. ADMIN tem acesso administrativo da empresa.</p>
                <button type="submit" disabled={creatingUser} className="btn btn-primary btn-sm">
                  {creatingUser ? "Criando..." : "Criar usuário"}
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
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Usuários da empresa #{data.companyId}</h2>
                <p className="mt-1 text-sm text-muted">Altere perfil, status e módulos sem perder o histórico da operação.</p>
              </div>
              <span className="badge badge-brand">{data.users.length} usuários</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-4">
              {data.users.map((user) => {
                const role = normalizeRole(user.role);
                const isAdmin = role === "ADMIN";
                const userModules = moduleAccess?.users.find((item) => item.id === user.id)?.modules || [];

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
                        <span className={isAdmin ? "badge badge-brand" : "badge"}>{role}</span>
                        <span className={user.isActive ? "badge badge-success" : "badge badge-danger"}>
                          {user.isActive ? "ATIVO" : "DESATIVADO"}
                        </span>
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
                        Tornar USER
                      </button>
                      <button
                        type="button"
                        disabled={changingUserId === user.id || !user.isActive || role === "ADMIN"}
                        onClick={() => setRole(user.id, "ADMIN")}
                        className="btn btn-primary btn-sm"
                      >
                        Tornar ADMIN
                      </button>
                      <button
                        type="button"
                        disabled={togglingActiveUserId === user.id}
                        onClick={() => toggleActive(user.id, Boolean(user.isActive))}
                        className={`btn btn-sm ${user.isActive ? "btn-secondary" : "btn-primary"}`}
                      >
                        {user.isActive ? "Desativar" : "Reativar"}
                      </button>
                    </div>

                    <div className="grid gap-2">
                      <p className="text-xs font-semibold uppercase text-muted">Módulos</p>
                      {isAdmin ? (
                        <p className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-muted">
                          ADMIN tem acesso total aos módulos liberados para a empresa.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {enabledModules.length === 0 ? (
                            <span className="text-sm text-muted">Nenhum módulo liberado para a empresa.</span>
                          ) : (
                            enabledModules.map((mod) => {
                              const row = userModules.find((item) => item.key === mod.key);
                              const allowed = row ? row.allowed : Boolean(mod.companyEnabled);
                              return (
                                <button
                                  key={`${user.id}-${mod.key}`}
                                  type="button"
                                  disabled={savingModuleUserId === user.id || !user.isActive}
                                  onClick={() => toggleUserModule(user.id, mod.key)}
                                  className={`btn btn-sm ${allowed && user.isActive ? "btn-primary" : "btn-ghost"}`}
                                  title="Clique para alternar"
                                >
                                  {mod.name}: {allowed && user.isActive ? "ON" : "OFF"}
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
