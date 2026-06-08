import type { ReactNode } from "react";
import type { UserFilter } from "./types";

type TeamListPanelProps = {
  showDesktopTeam: boolean;
  showDesktopModules: boolean;
  companyId: number;
  enabledModulesCount: number;
  usersCount: number;
  userSearch: string;
  setUserSearch: (value: string) => void;
  userFilter: UserFilter;
  setUserFilter: (value: UserFilter) => void;
  onCreateAccess: () => void;
  onOpenBatchPolicy?: () => void;
  referralCandidatesPanel?: ReactNode;
  children: ReactNode;
};

const USER_FILTERS: Array<[UserFilter, string]> = [
  ["active", "Ativos"],
  ["sellers", "Vendedores"],
  ["admins", "Admins"],
  ["inactive", "Inativos"],
  ["all", "Todos"],
];

export default function TeamListPanel({
  showDesktopTeam,
  showDesktopModules,
  companyId,
  enabledModulesCount,
  usersCount,
  userSearch,
  setUserSearch,
  userFilter,
  setUserFilter,
  onCreateAccess,
  onOpenBatchPolicy,
  referralCandidatesPanel,
  children,
}: TeamListPanelProps) {
  return (
    <section className="panel p-4 md:p-5 rounded-[20px]">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            {showDesktopModules ? `Módulos da equipe #${companyId}` : `Equipe da empresa #${companyId}`}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {showDesktopModules
              ? "Libere ou bloqueie módulos por vendedor sem misturar com edição de perfil."
              : "Altere perfil e status sem perder o histórico da operação."}
          </p>
        </div>
        <span className="badge badge-brand">
          {showDesktopModules ? `${enabledModulesCount} módulos` : `${usersCount} pessoas`}
        </span>
        <div className="flex flex-wrap gap-2">
          {onOpenBatchPolicy ? (
            <button type="button" onClick={onOpenBatchPolicy} className="btn btn-secondary btn-sm">
              Aplicar política
            </button>
          ) : null}
          {showDesktopTeam ? (
            <button type="button" onClick={onCreateAccess} className="btn btn-primary btn-sm">
              Criar acesso
            </button>
          ) : null}
        </div>
      </div>

      {showDesktopTeam ? referralCandidatesPanel : null}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{showDesktopModules ? "Buscar usuário" : "Buscar na equipe"}</span>
          <input
            type="search"
            placeholder="Nome, e-mail ou login"
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            className="field"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          {USER_FILTERS.map(([value, label]) => (
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

      {children}
    </section>
  );
}
