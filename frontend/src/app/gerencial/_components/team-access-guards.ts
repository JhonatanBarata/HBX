export const SELF_ACCESS_MESSAGE = "Você não pode remover seu próprio acesso.";
export const LAST_ADMIN_MESSAGE = "A empresa precisa manter pelo menos um administrador ativo.";

export type TeamRole = "USER" | "ADMIN" | "USERMASTER";
export type TeamRiskAction = "delete" | "deactivate" | "demote";

type TeamUserLike = {
  id?: number | null;
  role?: string | null;
  isSystemMaster?: boolean | null;
};

export function normalizeTeamRole(role?: string | null, isSystemMaster?: boolean | null): TeamRole {
  const normalized = String(role || "").trim().toUpperCase();
  if (isSystemMaster || normalized === "USERMASTER") return "USERMASTER";
  return normalized === "ADMIN" ? "ADMIN" : "USER";
}

export function isTenantTeamUser(user: TeamUserLike) {
  return normalizeTeamRole(user.role, user.isSystemMaster) !== "USERMASTER" && !user.isSystemMaster;
}

export function isOwnTeamUser(user: TeamUserLike, currentUserId?: number | null) {
  return Boolean(currentUserId && Number(user.id || 0) === Number(currentUserId));
}

export function getTeamAccessActionBlockMessage(
  user: TeamUserLike,
  currentUserId?: number | null,
  action?: TeamRiskAction,
) {
  if (!isOwnTeamUser(user, currentUserId)) return null;
  const role = normalizeTeamRole(user.role, user.isSystemMaster);
  if (action === "delete" || action === "deactivate") return SELF_ACCESS_MESSAGE;
  if (action === "demote" && role === "ADMIN") return SELF_ACCESS_MESSAGE;
  return null;
}

export function normalizeGerencialTeamError(message: string) {
  const lower = String(message || "").trim().toLowerCase();
  if (!lower) return "";
  if (
    lower.includes("remover seu próprio acesso") ||
    lower.includes("remover seu proprio acesso") ||
    lower.includes("desativar sua própria") ||
    lower.includes("desativar sua propria") ||
    lower.includes("excluir a si mesmo")
  ) {
    return SELF_ACCESS_MESSAGE;
  }
  if (
    lower.includes("precisa manter pelo menos um administrador ativo") ||
    lower.includes("último admin") ||
    lower.includes("ultimo admin")
  ) {
    return LAST_ADMIN_MESSAGE;
  }
  return "";
}
