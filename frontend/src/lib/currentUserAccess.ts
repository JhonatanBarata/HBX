export type CurrentUserAccessUser = {
  role?: string | null;
  userKind?: string | null;
  isSystemMaster?: boolean | null;
  sellerProfile?: {
    isHbxPartnerSeller?: boolean | null;
    isCommonSeller?: boolean | null;
    isAdmin?: boolean | null;
  } | null;
  company?: {
    id?: number | string | null;
    slug?: string | null;
    isHbxSellerNetwork?: boolean | null;
  } | null;
  masterContext?: {
    active?: boolean | null;
    mode?: string | null;
    companyId?: number | string | null;
  } | null;
};

export type CurrentUserAccess = {
  normalizedRole: string;
  normalizedUserKind: string;
  isSystemMaster: boolean;
  isOperationalMaster: boolean;
  isAssumedCompanyMaster: boolean;
  isCompanyAdmin: boolean;
  isCommonSeller: boolean;
  isHbxPartnerSeller: boolean;
  canCallAdminCompanyEndpoints: boolean;
  canCallWhatsAppAdminEndpoints: boolean;
  canManageTeam: boolean;
};

export function getCurrentUserAccess(user?: CurrentUserAccessUser | null): CurrentUserAccess {
  const normalizedRole = String(user?.role || "").trim().toUpperCase();
  const normalizedUserKind = String(user?.userKind || "").trim().toLowerCase();
  const isSystemMaster = Boolean(user?.isSystemMaster || normalizedUserKind === "system_master");
  const masterMode = String(user?.masterContext?.mode || "").trim().toLowerCase();
  const isAssumedCompanyMaster = Boolean(
    isSystemMaster && user?.masterContext?.active && masterMode === "empresa_assumida",
  );
  const isOperationalMaster = Boolean(isSystemMaster && !isAssumedCompanyMaster);
  const isHbxPartnerSeller = Boolean(
    !isSystemMaster &&
      (normalizedUserKind === "hbx_partner_seller" ||
        user?.sellerProfile?.isHbxPartnerSeller ||
        (user?.company?.isHbxSellerNetwork && normalizedRole === "USER")),
  );
  const isCompanyAdmin = Boolean(
    !isSystemMaster &&
      (normalizedRole === "ADMIN" ||
        normalizedUserKind === "admin" ||
        user?.sellerProfile?.isAdmin),
  );
  const isCommonSeller = Boolean(
    !isSystemMaster &&
      !isCompanyAdmin &&
      !isHbxPartnerSeller &&
      (normalizedRole === "USER" ||
        normalizedUserKind === "seller" ||
        user?.sellerProfile?.isCommonSeller),
  );
  const canCallAdminCompanyEndpoints = Boolean(isSystemMaster || isCompanyAdmin);
  const canCallWhatsAppAdminEndpoints = Boolean(isSystemMaster || isCompanyAdmin);
  const canManageTeam = Boolean(isSystemMaster || isCompanyAdmin);

  return {
    normalizedRole,
    normalizedUserKind,
    isSystemMaster,
    isOperationalMaster,
    isAssumedCompanyMaster,
    isCompanyAdmin,
    isCommonSeller,
    isHbxPartnerSeller,
    canCallAdminCompanyEndpoints,
    canCallWhatsAppAdminEndpoints,
    canManageTeam,
  };
}
