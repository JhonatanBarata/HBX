export type OperationalCapability = "SELLER" | "DRIVER";

type OperationalUser = {
  operationalCapabilities?: readonly string[] | null;
  role?: string | null;
  userKind?: string | null;
  isSystemMaster?: boolean | null;
} | null | undefined;

/** Projeção tolerante para a transição; o backend continua sendo a autoridade. */
export function operationalCapabilitiesOf(user: OperationalUser): OperationalCapability[] {
  if (Array.isArray(user?.operationalCapabilities)) {
    return (["SELLER", "DRIVER"] as const).filter((capability) =>
      user.operationalCapabilities?.includes(capability),
    );
  }
  const role = String(user?.role || "").toUpperCase();
  const kind = String(user?.userKind || "").toLowerCase();
  if (user?.isSystemMaster || role === "ADMIN" || role === "USERMASTER" || kind === "admin" || kind === "system_master") {
    return ["SELLER", "DRIVER"];
  }
  return role === "USER" || kind === "seller" ? ["SELLER"] : [];
}

export function canUseOperationalWorkspace(user: OperationalUser, capability: OperationalCapability): boolean {
  return operationalCapabilitiesOf(user).includes(capability);
}
