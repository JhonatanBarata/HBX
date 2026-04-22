"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { startSmartPolling } from "../_lib/polling";
import { useRequireAuth } from "../_lib/useRequireAuth";

type UserItem = {
  id: number;
  username?: string | null;
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
    role: string;
    isActive: boolean;
  };
  temporaryPassword?: string | null;
};

type ModulePermission = { key: string; allowed: boolean };
type CompanyModule = { key: string; name: string; companyEnabled: boolean };
type CompanyUserAccess = { id: number; modules: ModulePermission[] };
type CompanyAccessPayload = { modules: CompanyModule[]; users: CompanyUserAccess[] };

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
  const [createdPasswordInfo, setCreatedPasswordInfo] = useState<string | null>(null);
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
      setData(payload);
      setModuleAccess(access);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar modulo gerencial.";
      setError(message);
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
      const message = roleError instanceof Error ? roleError.message : "Falha ao atualizar perfil.";
      setError(message);
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
      const message = activeError instanceof Error ? activeError.message : "Falha ao atualizar status do funcionário.";
      setError(message);
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
      const message =
        toggleError instanceof Error ? toggleError.message : "Falha ao marcar reclamacao.";
      setError(message);
    } finally {
      setTogglingMessageId(null);
    }
  }

  async function createCompanyUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreatedPasswordInfo(null);

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

      if (payload?.temporaryPassword) {
        setCreatedPasswordInfo(`Senha temporária: ${payload.temporaryPassword}`);
      } else {
        setCreatedPasswordInfo("Usuário criado com senha definida manualmente.");
      }

      setNewUserEmail("");
      setNewUserName("");
      setNewUserRole("USER");
      setNewUserPassword("");
      await load();
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Falha ao cadastrar usuário.";
      setError(message);
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
      await load();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Falha ao atualizar modulos do usuario.";
      setError(message);
    } finally {
      setSavingModuleUserId(null);
    }
  }

  const topMessages = useMemo(() => data?.recentMessages?.slice(0, 20) ?? [], [data]);
  const topSurveys = useMemo(() => data?.surveys?.slice(0, 20) ?? [], [data]);

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
      title="Módulo gerencial"
      description="Visão analítica e administrativa da operação."
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
              <p className="stat-card__label">Reclamacoes</p>
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
              <p className="stat-card__label">Avaliacoes</p>
              <p className="stat-card__value">{data.totals.surveys}</p>
            </article>
          </section>

          <section className="panel p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Cadastrar novo usuário</h2>
              <span className="badge">ADMIN</span>
            </div>

            <form onSubmit={createCompanyUser} className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
              <input
                type="email"
                placeholder="E-mail"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className="h-10 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-3 text-sm"
                required
              />
              <input
                type="text"
                placeholder="Nome (opcional)"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                className="h-10 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-3 text-sm"
              />
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as "USER" | "ADMIN")}
                className="h-10 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-3 text-sm"
              >
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <input
                type="text"
                placeholder="Senha (opcional)"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                className="h-10 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-3 text-sm"
              />
              <div className="md:col-span-4 flex items-center justify-end">
                <button type="submit" disabled={creatingUser} className="btn btn-primary btn-sm">
                  {creatingUser ? "Cadastrando..." : "Cadastrar e-mail"}
                </button>
              </div>
            </form>

            {createdPasswordInfo ? <p className="text-xs text-muted mt-2">{createdPasswordInfo}</p> : null}
          </section>

          <section className="panel p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Usuários da empresa #{data.companyId}</h2>
              <span className="badge badge-brand">{data.users.length} usuários</span>
            </div>

            <div className="space-y-2 mt-3">
              {data.users.map((user) => (
                <div
                  key={user.id}
                  className="border border-[var(--line)] rounded-[12px] p-3 bg-[var(--surface-soft)] flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {user.username || user.email || `Usuário #${user.id}`}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {user.email || "sem e-mail"} | {user.role} | {user.isActive ? "ATIVO" : "DESATIVADO"}
                    </p>
                    {!user.isActive ? (
                      <p className="text-xs text-muted truncate mt-1">{retentionLabel(user.retentionUntil)}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={changingUserId === user.id || !user.isActive}
                        onClick={() => setRole(user.id, "USER")}
                        className={`btn btn-sm ${user.role === "USER" ? "btn-primary" : "btn-secondary"}`}
                      >
                        USER
                      </button>
                      <button
                        type="button"
                        disabled={changingUserId === user.id || !user.isActive}
                        onClick={() => setRole(user.id, "ADMIN")}
                        className={`btn btn-sm ${user.role === "ADMIN" ? "btn-primary" : "btn-secondary"}`}
                      >
                        ADMIN
                      </button>
                      <button
                        type="button"
                        disabled={togglingActiveUserId === user.id}
                        onClick={() => toggleActive(user.id, Boolean(user.isActive))}
                        className={`btn btn-sm ${user.isActive ? "btn-primary" : "btn-ghost"}`}
                      >
                        {user.isActive ? "ATIVO" : "DESATIVADO"}
                      </button>
                    </div>
                  </div>

                  <div className="w-full mt-2 flex flex-wrap gap-2">
                    {(moduleAccess?.modules || [])
                      .filter((mod) => mod.companyEnabled)
                        .map((mod) => {
                        const userModules = moduleAccess?.users.find((u) => u.id === user.id)?.modules || [];
                        const row = userModules.find((m) => m.key === mod.key);
                        const allowed = row ? row.allowed : Boolean(mod.companyEnabled);
                        return (
                          <button
                            key={`${user.id}-${mod.key}`}
                            type="button"
                            disabled={
                              savingModuleUserId === user.id ||
                              String(user.role).toUpperCase() === "ADMIN" ||
                              !user.isActive
                            }
                            onClick={() => toggleUserModule(user.id, mod.key)}
                            className={`btn btn-sm ${allowed && user.isActive ? "btn-primary" : "btn-ghost"}`}
                            title={String(user.role).toUpperCase() === "ADMIN" ? "ADMIN sempre possui acesso" : "Clique para alternar"}
                          >
                            {mod.name}: {allowed && user.isActive ? "ON" : "OFF"}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
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
