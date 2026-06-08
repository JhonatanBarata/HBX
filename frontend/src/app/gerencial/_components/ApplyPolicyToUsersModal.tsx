"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { TeamPolicy, TeamPolicyPatch, UserFilter, UserItem } from "./types";

type ApplyPolicyToUsersModalProps = {
  open: boolean;
  sourcePolicy: TeamPolicy | null;
  basePatch: TeamPolicyPatch | null;
  users: UserItem[];
  applying?: boolean;
  onClose: () => void;
  onApply: (targetUserIds: number[], patch: TeamPolicyPatch) => void | Promise<void>;
};

type SectionKey = "modules" | "compensation" | "hbxNetwork" | "limits" | "radar" | "visibility";

const SECTION_LABELS: Array<[SectionKey, string]> = [
  ["modules", "Módulos"],
  ["compensation", "Comissão e D+"],
  ["hbxNetwork", "Rede HBX"],
  ["limits", "Limites"],
  ["radar", "Radar"],
  ["visibility", "Visibilidade"],
];

const FILTERS: Array<[UserFilter, string]> = [
  ["active", "Ativos"],
  ["sellers", "Vendedores"],
  ["admins", "Admins"],
  ["inactive", "Inativos"],
  ["all", "Todos"],
];

function normalizeRole(role?: string | null, isSystemMaster?: boolean | null) {
  const normalized = String(role || "").toUpperCase();
  if (isSystemMaster || normalized === "USERMASTER") return "USERMASTER";
  return normalized === "ADMIN" ? "ADMIN" : "USER";
}

function roleLabel(role?: string | null, isSystemMaster?: boolean | null) {
  const normalized = normalizeRole(role, isSystemMaster);
  if (normalized === "USERMASTER") return "USERMASTER";
  if (normalized === "ADMIN") return "Admin";
  return "Vendedor";
}

function userLabel(user: Pick<UserItem, "id" | "name" | "username" | "email">) {
  return user.name || user.username || user.email || `Usuário #${user.id}`;
}

function matchesFilter(user: UserItem, filter: UserFilter) {
  const role = normalizeRole(user.role, user.isSystemMaster);
  return (
    filter === "all" ||
    (filter === "active" && user.isActive) ||
    (filter === "inactive" && !user.isActive) ||
    (filter === "admins" && role === "ADMIN") ||
    (filter === "sellers" && role === "USER")
  );
}

function buildPatchForSections(basePatch: TeamPolicyPatch, enabledSections: Record<SectionKey, boolean>): TeamPolicyPatch {
  const next: TeamPolicyPatch = {};
  if (enabledSections.modules && basePatch.modules) next.modules = basePatch.modules;
  if (enabledSections.compensation && basePatch.compensation) next.compensation = basePatch.compensation;
  if (enabledSections.hbxNetwork && basePatch.hbxNetwork) next.hbxNetwork = basePatch.hbxNetwork;
  if (enabledSections.limits && basePatch.limits) next.limits = basePatch.limits;
  if (enabledSections.radar && basePatch.radar) next.radar = basePatch.radar;
  if (enabledSections.visibility && basePatch.visibility) next.visibility = basePatch.visibility;
  return next;
}

function patchHasContent(patch: TeamPolicyPatch) {
  return Boolean(
    patch.modules?.length ||
      Object.keys(patch.compensation || {}).length ||
      Object.keys(patch.hbxNetwork || {}).length ||
      Object.keys(patch.limits || {}).length ||
      Object.keys(patch.radar || {}).length ||
      Object.keys(patch.visibility || {}).length,
  );
}

export default function ApplyPolicyToUsersModal({
  open,
  sourcePolicy,
  basePatch,
  users,
  applying = false,
  onClose,
  onApply,
}: ApplyPolicyToUsersModalProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<UserFilter>("active");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({
    modules: true,
    compensation: true,
    hbxNetwork: true,
    limits: true,
    radar: true,
    visibility: true,
  });
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => {
      setSelectedIds(new Set());
      setSearch("");
      setFilter("active");
      setSections({
        modules: true,
        compensation: true,
        hbxNetwork: true,
        limits: true,
        radar: true,
        visibility: true,
      });
      setLocalError(null);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [open, sourcePolicy?.subject.id]);

  const sourceUserId = sourcePolicy?.subject.id || 0;
  const eligibleUsers = useMemo(
    () =>
      users.filter((user) => {
        const role = normalizeRole(user.role, user.isSystemMaster);
        if (role === "USERMASTER" || user.isSystemMaster) return false;
        if (sourceUserId && user.id === sourceUserId) return false;
        return true;
      }),
    [sourceUserId, users],
  );

  const visibleUsers = useMemo(() => {
    const text = search.trim().toLowerCase();
    return eligibleUsers.filter((user) => {
      if (!matchesFilter(user, filter)) return false;
      if (!text) return true;
      return [userLabel(user), user.email, user.username, user.phone, roleLabel(user.role, user.isSystemMaster)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text));
    });
  }, [eligibleUsers, filter, search]);

  const selectedCount = selectedIds.size;
  const selectedVisibleCount = visibleUsers.filter((user) => selectedIds.has(user.id)).length;
  const finalPatch = useMemo(
    () => (basePatch ? buildPatchForSections(basePatch, sections) : {}),
    [basePatch, sections],
  );
  const canApply = Boolean(basePatch && patchHasContent(finalPatch) && selectedCount > 0 && !applying);

  if (!open || typeof document === "undefined") return null;

  function toggleSelected(userId: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function selectVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleUsers.forEach((user) => next.add(user.id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleApply() {
    if (!basePatch || !patchHasContent(finalPatch)) {
      setLocalError("Selecione ao menos uma seção da política.");
      return;
    }
    if (!selectedIds.size) {
      setLocalError("Selecione ao menos um vendedor ou admin.");
      return;
    }
    setLocalError(null);
    void onApply(Array.from(selectedIds), finalPatch);
  }

  return createPortal(
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/55 p-3 md:p-6" role="presentation">
      <section
        className="panel flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[20px]"
        role="dialog"
        aria-modal="true"
        aria-label="Aplicar política em lote"
      >
        <header className="flex flex-col gap-3 border-b border-[var(--line)] p-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <span className="badge badge-brand">Aplicação em lote</span>
            <h2 className="mt-2 text-xl font-semibold">Copiar política para usuários</h2>
            <p className="mt-1 text-sm text-muted">
              Fonte: {sourcePolicy?.subject.name || sourcePolicy?.subject.email || `Usuário #${sourcePolicy?.subject.id || "-"}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="badge">{selectedCount} selecionado(s)</span>
            <button type="button" onClick={onClose} disabled={applying} className="btn btn-secondary btn-sm">
              Fechar
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4 md:p-5">
          <div className="grid gap-4">
            {localError ? (
              <div className="rounded-[12px] border border-[var(--danger)] bg-[var(--surface-soft)] p-3 text-sm text-danger">
                {localError}
              </div>
            ) : null}

            <section className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
              <h3 className="font-semibold">Seções da política</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {SECTION_LABELS.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sections[key]}
                      disabled={applying}
                      onChange={(event) => setSections((current) => ({ ...current, [key]: event.target.checked }))}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Buscar usuário</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nome, e-mail ou login"
                    className="field"
                  />
                </label>
                <div className="flex flex-wrap items-end gap-2">
                  {FILTERS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value)}
                      disabled={applying}
                      className={`btn btn-sm ${filter === value ? "btn-primary" : "btn-secondary"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={selectVisible} disabled={applying || visibleUsers.length === 0} className="btn btn-secondary btn-sm">
                  Selecionar visíveis
                </button>
                <button type="button" onClick={clearSelection} disabled={applying || selectedCount === 0} className="btn btn-ghost btn-sm">
                  Limpar seleção
                </button>
                <span className="badge">
                  {selectedVisibleCount}/{visibleUsers.length} visíveis
                </span>
              </div>

              <div className="mt-4 overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--surface)]">
                <div className="grid grid-cols-[44px_minmax(180px,1.4fr)_minmax(160px,1fr)_110px_96px] border-b border-[var(--line)] bg-[var(--surface-soft)] px-2 py-2 text-xs font-semibold uppercase text-muted">
                  <span />
                  <span>Nome</span>
                  <span>E-mail/Login</span>
                  <span>Perfil</span>
                  <span>Status</span>
                </div>
                <div className="max-h-[42vh] overflow-auto">
                  {visibleUsers.length === 0 ? (
                    <div className="p-4 text-sm text-muted">Nenhum usuário elegível com estes filtros.</div>
                  ) : (
                    visibleUsers.map((user) => {
                      const selected = selectedIds.has(user.id);
                      return (
                        <label
                          key={user.id}
                          className="grid cursor-pointer grid-cols-[44px_minmax(180px,1.4fr)_minmax(160px,1fr)_110px_96px] items-center gap-0 border-b border-[var(--line)] px-2 py-2 text-sm last:border-b-0 hover:bg-[var(--surface-soft)]"
                        >
                          <span className="flex justify-center">
                            <input type="checkbox" checked={selected} disabled={applying} onChange={() => toggleSelected(user.id)} />
                          </span>
                          <strong className="truncate pr-3">{userLabel(user)}</strong>
                          <span className="truncate pr-3 text-muted">{user.email || user.username || "-"}</span>
                          <span className="badge">{roleLabel(user.role, user.isSystemMaster)}</span>
                          <span className={user.isActive ? "badge badge-success" : "badge badge-danger"}>
                            {user.isActive ? "Ativo" : "Inativo"}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted">USERMASTER e a própria fonte ficam fora da lista por regra do backend.</div>
          <button type="button" onClick={handleApply} disabled={!canApply} className="btn btn-primary btn-sm">
            {applying ? "Aplicando..." : `Aplicar em ${selectedCount || 0}`}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
